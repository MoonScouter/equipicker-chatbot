export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const topic = url.searchParams.get("topic") ?? "";
    // Fetch a programming joke
    let jokeUrl = "https://v2.jokeapi.dev/joke/Programming";
    if (topic.trim().length > 0) {
      const encoded = encodeURIComponent(topic.trim());
      jokeUrl += `?contains=${encoded}`;
    }
    const jokeRes = await fetch(jokeUrl);
    if (!jokeRes.ok) throw new Error("Failed to fetch joke");

    const jokeData = await jokeRes.json();

    // Format joke response based on its type
    const joke =
      jokeData.type === "twopart"
        ? `${jokeData.setup} - ${jokeData.delivery}`
        : jokeData.joke;

    return new Response(JSON.stringify({ joke }), { status: 200 });
  } catch (error) {
    console.error("Error fetching joke:", error);
    return new Response(JSON.stringify({ error: "Could not fetch joke" }), {
      status: 500,
    });
  }
}
