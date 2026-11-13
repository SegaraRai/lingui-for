import { expect, test, vi } from "vite-plus/test";

import {
  closedPreviews,
  findBuild,
  parsePreviewCommand,
  reportBody,
  resolveComment,
  resolveRun,
  upsertComment,
} from "./preview.ts";

const repository = "owner/lingui-for";
const head = "a".repeat(40);
const artifact = `sites-${"b".repeat(40)}`;

function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    state: "open",
    labels: [
      {
        name: "preview",
      },
    ],
    head: {
      sha: head,
      repo: {
        full_name: repository,
      },
    },
    ...overrides,
  };
}

function api(routes: Record<string, unknown>) {
  return vi.fn(
    async (
      path: string,
      init?: {
        method: string;
        body?: unknown;
      },
    ) => {
      if (init) {
        return {};
      }
      const route = Object.keys(routes).find((prefix) => path.includes(prefix));
      return route ? routes[route] : null;
    },
  ) as never;
}

const buildRoutes = {
  "/actions/workflows/sites.yml/runs": {
    workflow_runs: [
      {
        id: 11,
        head_repository: { full_name: repository },
      },
    ],
  },
  "/actions/runs/11/artifacts": {
    artifacts: [
      {
        name: `sites-browser-${head}`,
        expired: false,
      },
      {
        name: artifact,
        expired: false,
      },
    ],
  },
};

function comment(body: string, overrides: Record<string, unknown> = {}) {
  return {
    issue: {
      number: 7,
      pull_request: {},
    },
    comment: {
      id: 3,
      body,
      user: {
        login: "maintainer",
        type: "User",
      },
      ...overrides,
    },
  };
}

test.each([
  { body: "/preview", expected: {} },
  { body: " /preview\n", expected: {} },
  { body: `/preview ${head}`, expected: { sha: head } },
  { body: "please /preview", expected: null },
  { body: "/preview now please", expected: null },
  { body: "/previews", expected: null },
])("parses Preview commands: $body", ({ body, expected }) => {
  const result = parsePreviewCommand(body);
  if (expected) {
    expect(result).toMatchObject(expected);
  } else {
    expect(result).toBeNull();
  }
});

test("a writer's command selects the head build and skips other artifacts", async () => {
  await expect(
    resolveComment(
      comment("/preview"),
      repository,
      api({
        "/permission": {
          permission: "write",
        },
        "/pulls/7": pullRequest({
          labels: [],
        }),
        ...buildRoutes,
      }),
    ),
  ).resolves.toEqual({
    pull: 7,
    sha: head,
    run: 11,
    artifact,
  });
});

test.each([
  {
    name: "a reader",
    event: comment("/preview"),
    permission: "read",
  },
  {
    name: "a non-collaborator",
    event: comment("/preview"),
    permission: undefined,
  },
  {
    name: "a bot",
    event: comment("/preview", {
      user: {
        login: "bot",
        type: "Bot",
      },
    }),
    permission: "admin",
  },
  {
    name: "an issue",
    event: {
      ...comment("/preview"),
      issue: {
        number: 7,
      },
    },
    permission: "admin",
  },
  {
    name: "ordinary text",
    event: comment("looks good"),
    permission: "admin",
  },
])("ignores a command from $name", async ({ event, permission }) => {
  const github = api({
    "/permission": permission && { permission },
    "/pulls/7": pullRequest(),
    ...buildRoutes,
  });
  await expect(resolveComment(event, repository, github)).resolves.toBeNull();
  expect(github).not.toHaveBeenCalledWith(expect.stringContaining("/pulls/7"));
});

test("a fork requires the full head SHA", async () => {
  const fork = pullRequest({
    head: {
      sha: head,
      repo: {
        full_name: "fork/lingui-for",
      },
    },
  });
  const routes = {
    "/permission": { permission: "admin" },
    "/pulls/7": fork,
    "/actions/workflows/sites.yml/runs": {
      workflow_runs: [
        {
          id: 11,
          head_repository: {
            full_name: "fork/lingui-for",
          },
        },
      ],
    },
    "/actions/runs/11/artifacts": buildRoutes["/actions/runs/11/artifacts"],
  };
  await expect(
    resolveComment(comment("/preview"), repository, api(routes)),
  ).resolves.toMatchObject({
    reply: expect.stringContaining("full-head-sha"),
  });
  await expect(
    resolveComment(
      comment(`/preview ${head.slice(0, 7)}`),
      repository,
      api(routes),
    ),
  ).resolves.toMatchObject({
    reply: expect.stringContaining("is not the full SHA"),
  });
  await expect(
    resolveComment(
      comment(`/preview ${"c".repeat(40)}`),
      repository,
      api(routes),
    ),
  ).resolves.toMatchObject({
    reply: expect.stringContaining("is not the full SHA"),
  });
  await expect(
    resolveComment(comment(`/preview ${head}`), repository, api(routes)),
  ).resolves.toEqual({
    pull: 7,
    sha: head,
    run: 11,
    artifact,
  });
});

test("explains closed pull requests and missing builds", async () => {
  await expect(
    resolveComment(
      comment("/preview"),
      repository,
      api({
        "/permission": {
          permission: "write",
        },
        "/pulls/7": pullRequest({
          state: "closed",
        }),
      }),
    ),
  ).resolves.toMatchObject({
    reply: expect.stringContaining("open pull request"),
  });
  await expect(
    resolveComment(
      comment("/preview"),
      repository,
      api({
        "/permission": {
          permission: "write",
        },
        "/pulls/7": pullRequest(),
      }),
    ),
  ).resolves.toMatchObject({
    reply: expect.stringContaining("No site build"),
  });
});

test("ignores builds from another repository and expired builds", async () => {
  const pull = pullRequest();
  await expect(
    findBuild(
      pull,
      repository,
      api({
        ...buildRoutes,
        "/actions/workflows/sites.yml/runs": {
          workflow_runs: [
            {
              id: 11,
              head_repository: {
                full_name: "fork/lingui-for",
              },
            },
          ],
        },
      }),
    ),
  ).resolves.toBeNull();
  await expect(
    findBuild(
      pull,
      repository,
      api({
        ...buildRoutes,
        "/actions/runs/11/artifacts": {
          artifacts: [
            {
              name: artifact,
              expired: true,
            },
          ],
        },
      }),
    ),
  ).resolves.toBeNull();
});

const run = {
  workflow_run: {
    head_sha: head,
    head_repository: {
      full_name: repository,
    },
    pull_requests: [
      {
        number: 7,
      },
    ],
  },
};

test("a finished run publishes a labeled pull request at its head", async () => {
  await expect(
    resolveRun(
      run,
      repository,
      api({
        "/pulls/7": pullRequest(),
        ...buildRoutes,
      }),
    ),
  ).resolves.toEqual({
    pull: 7,
    sha: head,
    run: 11,
    artifact,
  });
});

test.each([
  {
    name: "without the label",
    pull: pullRequest({
      labels: [],
    }),
    event: run,
  },
  {
    name: "that closed",
    pull: pullRequest({
      state: "closed",
    }),
    event: run,
  },
  {
    name: "with a newer head",
    pull: pullRequest({
      head: {
        sha: "c".repeat(40),
        repo: {
          full_name: repository,
        },
      },
    }),
    event: run,
  },
  {
    name: "from a fork",
    pull: pullRequest({
      head: {
        sha: head,
        repo: {
          full_name: "fork/lingui-for",
        },
      },
    }),
    event: run,
  },
  {
    name: "whose run came from a fork",
    pull: pullRequest(),
    event: {
      workflow_run: {
        ...run.workflow_run,
        head_repository: {
          full_name: "fork/lingui-for",
        },
      },
    },
  },
  {
    name: "that the run does not name",
    pull: pullRequest(),
    event: {
      workflow_run: {
        ...run.workflow_run,
        pull_requests: [],
      },
    },
  },
])("a finished run skips a pull request $name", async ({ pull, event }) => {
  await expect(
    resolveRun(
      event,
      repository,
      api({
        "/pulls/7": pull,
        ...buildRoutes,
      }),
    ),
  ).resolves.toBeNull();
});

test("replaces the bot's report and leaves copied markers", async () => {
  const marker = "<!-- lingui-for-site-preview -->";
  const github = api({
    "/issues/7/comments": [
      {
        id: 1,
        body: `${marker}\ncopied`,
        user: {
          type: "User",
        },
      },
      {
        id: 2,
        body: `${marker}\nold`,
        user: {
          type: "Bot",
        },
      },
    ],
  });
  await upsertComment(7, "new", repository, github);
  expect(github).toHaveBeenCalledWith(`repos/${repository}/issues/comments/2`, {
    method: "PATCH",
    body: {
      body: `${marker}\nnew`,
    },
  });
});

test("creates a report when no earlier one exists", async () => {
  const github = api({ "/issues/7/comments": [] });
  await upsertComment(7, "new", repository, github);
  expect(github).toHaveBeenCalledWith(
    `repos/${repository}/issues/7/comments`,
    expect.objectContaining({ method: "POST" }),
  );
});

test("reports published sites and links failures to the run", () => {
  const body = reportBody({
    sha: head,
    success: true,
    run: "https://example.test/run",
    urls: {
      Docs: "https://pr-7.lingui-for-preview.roundtrip.dev/",
      Other: "",
    },
  });
  expect(body).toContain(
    "- Docs: https://pr-7.lingui-for-preview.roundtrip.dev/",
  );
  expect(body).not.toContain("Other");
  expect(
    reportBody({
      sha: head,
      success: false,
      run: "https://example.test/run",
      urls: {},
    }),
  ).toContain("(https://example.test/run)");
});

test("lists closed pull requests and omits issues", async () => {
  await expect(
    closedPreviews(
      repository,
      api({
        "/issues?": [
          {
            number: 7,
            pull_request: {},
          },
          {
            number: 8,
          },
        ],
      }),
    ),
  ).resolves.toEqual([7]);
});
