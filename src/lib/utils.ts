import { NextRequest, NextResponse } from "next/server";

export function createProxyRequestHandler(
  targetUrl: string,
  { searchParams = {} }: { searchParams?: Record<string, string> } = {}
) {
  return async function handler(
    req: NextRequest,
    context: { params: { path: string[] } }
  ): Promise<NextResponse> {
    const url = new URL(targetUrl);

    url.pathname = [
      url.pathname.split("/").slice(1),
      ...context.params.path,
    ].join("/");

    url.search = req.nextUrl.search;

    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const headers = new Headers(req.headers);
    headers.delete("host");

    try {
      const response = await fetch(url, {
        method: req.method,
        headers: headers,
        body: req.method === "POST" ? await req.text() : undefined,
      });

      const data = await response.text();

      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      console.error("Proxy error:", error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  };
}
