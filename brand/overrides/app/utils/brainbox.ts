// Brainbox: kleine Helfer für Anfragen an die Brainbox-Zentrale (/zentrale).

/**
 * Holt JSON von der Zentrale mit der Sitzung des Wikis.
 *
 * @param url Pfad, z. B. "/zentrale/api/summary"
 * @returns die Antwort oder null, wenn die Zentrale nicht antwortet oder ablehnt
 */
export async function getBrainboxJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
