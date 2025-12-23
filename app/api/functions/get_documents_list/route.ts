import OpenAI from "openai";

const openai = new OpenAI();

const DOCUMENT_TYPE = "documents_list";
const PAGE_LIMIT = 100;
const fetchVectorStoreFileContent = async (
  vectorStoreId: string,
  vectorStoreFileId: string
) => {
  try {
    const page = await openai.vectorStores.files.content(
      vectorStoreId,
      vectorStoreFileId
    );
    const text = Array.isArray((page as any).data)
      ? (page as any).data.map((p: any) => p?.text ?? "").join("")
      : "";
    if (!text) {
      return { error: "documents_list file content is empty" };
    }
    try {
      return { json: JSON.parse(text) };
    } catch {
      return { error: "documents_list file is not valid JSON" };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch vector store file content",
    };
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vectorStoreId = searchParams.get("vector_store_id") ?? "";

  if (!vectorStoreId) {
    return new Response(JSON.stringify({ error: "Missing vector_store_id" }), {
      status: 400,
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        { status: 500 }
      );
    }

    const isNewerMatch = (candidate: any, current: any) => {
      const candidateCreated =
        typeof candidate?.created_at === "number" ? candidate.created_at : 0;
      const currentCreated =
        typeof current?.created_at === "number" ? current.created_at : 0;
      if (candidateCreated !== currentCreated) {
        return candidateCreated > currentCreated;
      }
      const candidateId = typeof candidate?.id === "string" ? candidate.id : "";
      const currentId = typeof current?.id === "string" ? current.id : "";
      return candidateId > currentId;
    };

    let after: string | undefined;
    let found: any = null;

    while (true) {
      const page = await openai.vectorStores.files.list(vectorStoreId, {
        limit: PAGE_LIMIT,
        ...(after ? { after } : {}),
      });

      for (const file of page.data) {
        if (file?.attributes?.document_type === DOCUMENT_TYPE) {
          if (!found || isNewerMatch(file, found)) {
            found = file;
          }
        }
      }

      const hasMore = (page as any).has_more;
      const lastId =
        (page as any).last_id ?? page.data[page.data.length - 1]?.id;

      if (!hasMore || !lastId) {
        break;
      }
      after = lastId;
    }

    if (!found) {
      return new Response(
        JSON.stringify({
          error: `No file with document_type "${DOCUMENT_TYPE}" found`,
        }),
        { status: 404 }
      );
    }

    const fileId = found.id;
    const contentResult = await fetchVectorStoreFileContent(vectorStoreId, fileId);
    if ("error" in contentResult) {
      return new Response(JSON.stringify({ error: contentResult.error }), {
        status: 502,
      });
    }

    return new Response(JSON.stringify(contentResult.json), { status: 200 });
  } catch (error) {
    console.error("Error fetching documents_list:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Error fetching documents list",
      }),
      { status: 500 }
    );
  }
}
