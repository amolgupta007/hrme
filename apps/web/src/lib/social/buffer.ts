import type {
  ActionResult,
} from "@/types";
import type {
  BufferCreatePostArgs,
  BufferCreatePostResult,
  BufferPostStatusResult,
} from "./types";

const BUFFER_GRAPHQL_URL =
  process.env.BUFFER_GRAPHQL_URL ?? "https://api.buffer.com/graphql";

async function bufferFetch<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) return { success: false, error: "BUFFER_ACCESS_TOKEN not set" };

  let res: Response;
  try {
    res = await fetch(BUFFER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Buffer unreachable";
    return { success: false, error: `Buffer unreachable: ${message}` };
  }

  if (!res.ok) {
    return { success: false, error: `Buffer HTTP ${res.status}: ${await safeText(res)}` };
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    return { success: false, error: json.errors.map((e) => e.message).join("; ") };
  }
  if (!json.data) {
    return { success: false, error: "Buffer returned no data" };
  }
  return { success: true, data: json.data };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return "(unreadable body)";
  }
}

export async function createLinkedInPost(
  args: BufferCreatePostArgs,
): Promise<ActionResult<BufferCreatePostResult>> {
  const mode = args.mode ?? "addToQueue";

  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess {
          post { id status dueAt }
        }
        ... on InvalidInputError { message }
        ... on UnauthorizedError { message }
        ... on UnexpectedError { message }
        ... on NotFoundError { message }
        ... on LimitReachedError { message }
        ... on RestProxyError { message code }
      }
    }
  `;

  const input = {
    channelId: args.channelId,
    text: args.text,
    schedulingType: "automatic",
    mode,
    aiAssisted: true,
    source: "jambahr-social-agent",
    dueAt: mode === "customScheduled" ? args.dueAt : undefined,
    assets: {
      images: [
        {
          url: args.imageUrl,
          metadata: { altText: args.imageAltText },
        },
      ],
    },
  };

  const result = await bufferFetch<{
    createPost: {
      __typename: string;
      post?: { id: string; status: string; dueAt: string | null };
      message?: string;
    };
  }>(mutation, { input });

  if (!result.success) return result;

  const payload = result.data.createPost;
  if (payload.__typename === "PostActionSuccess" && payload.post) {
    return {
      success: true,
      data: {
        postId: payload.post.id,
        status: payload.post.status,
        dueAt: payload.post.dueAt,
      },
    };
  }
  return {
    success: false,
    error: `Buffer ${payload.__typename}: ${payload.message ?? "unknown error"}`,
  };
}

export async function getPostStatus(
  postId: string,
): Promise<ActionResult<BufferPostStatusResult>> {
  const query = `
    query GetPost($input: PostInput!) {
      post(input: $input) {
        id
        status
        sentAt
        error { message }
      }
    }
  `;
  const result = await bufferFetch<{
    post: {
      id: string;
      status: BufferPostStatusResult["status"];
      sentAt: string | null;
      error: { message: string } | null;
    };
  }>(query, { input: { id: postId } });

  if (!result.success) return result;

  return {
    success: true,
    data: {
      postId: result.data.post.id,
      status: result.data.post.status,
      sentAt: result.data.post.sentAt,
      errorMessage: result.data.post.error?.message ?? null,
    },
  };
}

export async function deleteBufferPost(postId: string): Promise<ActionResult<void>> {
  const mutation = `
    mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) {
        __typename
        ... on DeletePostSuccess { id }
        ... on VoidMutationError { message }
      }
    }
  `;
  const result = await bufferFetch<{
    deletePost: { __typename: string; id?: string; message?: string };
  }>(mutation, { input: { id: postId } });

  if (!result.success) return result;

  if (result.data.deletePost.__typename === "DeletePostSuccess") {
    return { success: true, data: undefined };
  }
  return {
    success: false,
    error: result.data.deletePost.message ?? "Buffer deletePost failed",
  };
}

export async function getQueuedPostsCount(
  organizationId: string,
  channelId: string,
): Promise<ActionResult<number>> {
  const query = `
    query CountQueued($input: PostsInput!) {
      posts(input: $input) {
        edges { node { id status } }
      }
    }
  `;
  const result = await bufferFetch<{
    posts: { edges: Array<{ node: { id: string; status: string } }> };
  }>(query, {
    input: {
      organizationId,
      filter: {
        channelIds: [channelId],
        status: ["draft", "needs_approval", "scheduled", "sending"],
      },
    },
  });

  if (!result.success) return result;

  return { success: true, data: result.data.posts.edges.length };
}
