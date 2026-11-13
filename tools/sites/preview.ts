/**
 * Decides which pull request build a privileged workflow may publish as a Preview.
 *
 * The caller runs in the default branch's context with write access to the pull request, so this
 * module trusts only the GitHub API. Workflow files in a pull request can change what its runs
 * report and upload. Events therefore act as wake-up signals, and the API supplies labels, head
 * commits, and permissions. This module has no dependencies, so the deciding job installs nothing.
 *
 * Run `resolve` to select a build from the current event, `report` to publish the result on the
 * pull request, and `closed` to list closed pull requests that still have Previews.
 */

import { appendFile, readFile } from "node:fs/promises";

/** Requests a Preview for every commit of a pull request from this repository. */
export const previewLabel = "preview";

/** Marks a pull request that may have Previews to delete after it closes. */
export const activeLabel = "preview:active";

const commentMarker = "<!-- lingui-for-site-preview -->";
const buildArtifact = /^sites-[0-9a-f]{40,64}$/;

type GitHub = <T>(
  path: string,
  init?: {
    method: string;
    body?: unknown;
  },
) => Promise<T | null>;

interface PullRequest {
  number: number;
  state: string;
  labels: {
    name: string;
  }[];
  head: {
    sha: string;
    repo: {
      full_name: string;
    } | null;
  };
}

/**
 * Identifies an uploaded build that the deployment job may publish.
 */
export interface PreviewBuild {
  pull: number;
  sha: string;
  run: number;
  artifact: string;
}

/**
 * Carries the explanation for a Preview command that cannot run.
 */
export interface PreviewRefusal {
  pull: number;
  reply: string;
}

export type Resolution = PreviewBuild | PreviewRefusal | null;

/**
 * Parses a comment whose whole text is `/preview`, optionally followed by a commit SHA.
 * Returns null for other comments.
 */
export function parsePreviewCommand(body: string): { sha?: string } | null {
  const match = /^\/preview(?:[ \t]+(\S+))?$/.exec(body.trim());
  return match ? { sha: match[1] } : null;
}

/**
 * Returns the newest uploaded build for the pull request's head commit, or null when no build
 * remains. A failed run qualifies, because a Preview can help to investigate the failure.
 * A build is accepted only from the repository that owns the head commit.
 */
export async function findBuild(
  pull: PullRequest,
  repository: string,
  github: GitHub,
): Promise<PreviewBuild | null> {
  const headRepository = pull.head.repo?.full_name;
  if (!headRepository) {
    return null;
  }
  const runs = await github<{
    workflow_runs: {
      id: number;
      head_repository: {
        full_name: string;
      } | null;
    }[];
  }>(
    `repos/${repository}/actions/workflows/sites.yml/runs?head_sha=${pull.head.sha}&event=pull_request&status=completed&per_page=20`,
  );
  for (const run of runs?.workflow_runs ?? []) {
    if (run.head_repository?.full_name !== headRepository) {
      continue;
    }
    const listing = await github<{
      artifacts: {
        name: string;
        expired: boolean;
      }[];
    }>(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
    const artifact = listing?.artifacts.find(
      ({ name, expired }) => !expired && buildArtifact.test(name),
    );
    if (artifact) {
      return {
        pull: pull.number,
        sha: pull.head.sha,
        run: run.id,
        artifact: artifact.name,
      };
    }
  }
  return null;
}

/**
 * Handles a `/preview` comment from an `issue_comment` event.
 * Ignores comments that are not commands, and commands from people without write access.
 * A fork can change after a maintainer reviews it, so its command must name the full head SHA.
 * Adds a reaction to an accepted command. Returns a build or the reason why none can run.
 */
export async function resolveComment(
  event: {
    issue: {
      number: number;
      pull_request?: unknown;
    };
    comment: {
      id: number;
      body: string;
      user: {
        login: string;
        type: string;
      };
    };
  },
  repository: string,
  github: GitHub,
): Promise<Resolution> {
  const command = parsePreviewCommand(event.comment.body);
  if (
    !event.issue.pull_request ||
    !command ||
    event.comment.user.type !== "User"
  ) {
    return null;
  }
  const access = await github<{
    permission: string;
  }>(
    `repos/${repository}/collaborators/${encodeURIComponent(event.comment.user.login)}/permission`,
  );
  if (access?.permission !== "admin" && access?.permission !== "write") {
    return null;
  }
  await github(
    `repos/${repository}/issues/comments/${event.comment.id}/reactions`,
    {
      method: "POST",
      body: {
        content: "eyes",
      },
    },
  );
  const number = event.issue.number;
  const pull = await github<PullRequest>(`repos/${repository}/pulls/${number}`);
  if (pull?.state !== "open") {
    return { pull: number, reply: "A Preview requires an open pull request." };
  }
  const fork = pull.head.repo?.full_name !== repository;
  if (fork && !command.sha) {
    return {
      pull: number,
      reply: "A pull request from a fork requires `/preview <full-head-sha>`.",
    };
  }
  if (command.sha && command.sha !== pull.head.sha) {
    return {
      pull: number,
      reply: `\`${command.sha}\` is not the full SHA of the current head commit, \`${pull.head.sha}\`.`,
    };
  }
  return (
    (await findBuild(pull, repository, github)) ?? {
      pull: number,
      reply: `No site build is available for \`${pull.head.sha}\`. Sites may still be running, may have selected no site, or its build may have expired. Comment again after Sites uploads a build.`,
    }
  );
}

/**
 * Handles a finished run from a `workflow_run` event.
 * Selects a build only for an open pull request from this repository that has the Preview label
 * and whose head is the run's commit. Other runs need no reply, because they happen on each push.
 */
export async function resolveRun(
  event: {
    workflow_run: {
      head_sha: string;
      head_repository: {
        full_name: string;
      } | null;
      pull_requests: {
        number: number;
      }[];
    };
  },
  repository: string,
  github: GitHub,
): Promise<Resolution> {
  const run = event.workflow_run;
  const number = run.pull_requests[0]?.number;
  if (run.head_repository?.full_name !== repository || number === undefined) {
    return null;
  }
  const pull = await github<PullRequest>(`repos/${repository}/pulls/${number}`);
  if (
    pull?.state !== "open" ||
    pull.head.repo?.full_name !== repository ||
    pull.head.sha !== run.head_sha ||
    !pull.labels.some(({ name }) => name === previewLabel)
  ) {
    return null;
  }
  return findBuild(pull, repository, github);
}

/**
 * Creates the pull request's Preview comment, or replaces the comment from an earlier report.
 * Only a bot's comment qualifies, so another person cannot have a copied marker overwritten.
 */
export async function upsertComment(
  pull: number,
  body: string,
  repository: string,
  github: GitHub,
): Promise<void> {
  const text = `${commentMarker}\n${body}`;
  for (let page = 1; ; page++) {
    const comments = await github<
      {
        id: number;
        body: string;
        user: {
          type: string;
        } | null;
      }[]
    >(`repos/${repository}/issues/${pull}/comments?per_page=100&page=${page}`);
    const existing = comments?.find(
      (comment) =>
        comment.user?.type === "Bot" && comment.body.startsWith(commentMarker),
    );
    if (existing) {
      await github(`repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: { body: text },
      });
      return;
    }
    if (!comments || comments.length < 100) {
      break;
    }
  }
  await github(`repos/${repository}/issues/${pull}/comments`, {
    method: "POST",
    body: {
      body: text,
    },
  });
}

/**
 * Returns the report for a deployment. Lists only the sites with a URL.
 */
export function reportBody(report: {
  sha: string;
  success: boolean;
  run: string;
  urls: Record<string, string | undefined>;
}): string {
  const links = Object.entries(report.urls)
    .filter(([, url]) => url)
    .map(([name, url]) => `- ${name}: ${url}`);
  const status = report.success
    ? `Commit \`${report.sha}\` is published.`
    : `Publishing commit \`${report.sha}\` failed. See [the workflow run](${report.run}).`;
  return [
    "### Site Preview",
    "",
    status,
    ...(links.length ? ["", ...links] : []),
  ].join("\n");
}

/**
 * Returns the numbers of closed pull requests that still have the active label.
 */
export async function closedPreviews(
  repository: string,
  github: GitHub,
): Promise<number[]> {
  const issues = await github<
    {
      number: number;
      pull_request?: unknown;
    }[]
  >(
    `repos/${repository}/issues?state=closed&labels=${encodeURIComponent(activeLabel)}&per_page=100`,
  );
  return (issues ?? [])
    .filter((issue) => issue.pull_request)
    .map((issue) => issue.number);
}

function createGitHub(token: string): GitHub {
  return async <T>(
    path: string,
    init?: {
      method: string;
      body?: unknown;
    },
  ) => {
    const response = await fetch(`https://api.github.com/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 && !init) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `GitHub ${init?.method ?? "GET"} ${path}: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as T;
  };
}

async function writeOutputs(outputs: Record<string, string>): Promise<void> {
  console.log(JSON.stringify(outputs));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(""),
    );
  }
}

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY!;
  const github = createGitHub(process.env.GH_TOKEN!);
  const command = process.argv[2];
  if (command === "resolve") {
    const event = JSON.parse(
      await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"),
    );
    const result =
      process.env.GITHUB_EVENT_NAME === "issue_comment"
        ? await resolveComment(event, repository, github)
        : await resolveRun(event, repository, github);
    if (result && "reply" in result) {
      await github(`repos/${repository}/issues/${result.pull}/comments`, {
        method: "POST",
        body: {
          body: result.reply,
        },
      });
    }
    await writeOutputs(
      result && "artifact" in result
        ? {
            deploy: "true",
            pull: String(result.pull),
            sha: result.sha,
            run: String(result.run),
            artifact: result.artifact,
          }
        : { deploy: "false" },
    );
  } else if (command === "report") {
    const pull = Number(process.env.PREVIEW_PULL);
    await github(`repos/${repository}/issues/${pull}/labels`, {
      method: "POST",
      body: {
        labels: [activeLabel],
      },
    });
    await upsertComment(
      pull,
      reportBody({
        sha: process.env.PREVIEW_SHA!,
        success: process.env.PREVIEW_RESULT === "success",
        run: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        urls: {
          Docs: process.env.DOCS_URL,
        },
      }),
      repository,
      github,
    );
  } else if (command === "closed") {
    await writeOutputs({
      pulls: (await closedPreviews(repository, github)).join(" "),
    });
  } else {
    throw new Error("Usage: preview <resolve|report|closed>");
  }
}
