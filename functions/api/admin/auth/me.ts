const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const onRequestGet = async (): Promise<Response> => json({ ok: true }, 200);
