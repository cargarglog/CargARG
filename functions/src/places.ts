import * as functions from "firebase-functions/v1";
import axios from "axios";

export const placesAutocomplete = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const { q, lang = "es", region = "AR", session } = req.query as Record<
        string,
        string | undefined
      >;

      console.log("[placesAutocomplete] query:", { q, lang, region, session });

      const PLACES_API_KEY =
        process.env.PLACES_API_KEY ||
        ((functions as any).config?.() && (functions as any).config().google?.api_key);

      if (!q || String(q).trim().length === 0) {
        res.status(400).json({ error: "q required" });
        return;
      }
      if (!PLACES_API_KEY) {
        console.error("[placesAutocomplete] Missing PLACES_API_KEY");
        res.status(500).json({ error: "missing_api_key" });
        return;
      }

      // Endpoint oficial de la nueva Places API (v1)
      const url = "https://places.googleapis.com/v1/places:autocomplete";

      const body = {
        input: q,
        languageCode: lang,
        regionCode: region,
        sessionToken: session,
      };

      const headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_API_KEY,
        // Opcionalmente, podés limitar los campos que devuelve la API para optimizar rendimiento
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      } as Record<string, string>;

      const response = await axios.post(url, body, { headers });
      const { suggestions } = response.data || {};

      console.log("[placesAutocomplete] provider:", {
        count: suggestions?.length || 0,
      });

      const items = Array.isArray(suggestions)
        ? suggestions.map((s: any) => ({
            id: s.placePrediction?.placeId,
            label: s.placePrediction?.text?.text,
            address:
              s.placePrediction?.structuredFormat?.mainText?.text ||
              s.placePrediction?.text?.text,
          }))
        : [];

      // Devuelve resultados (o vacío si no hay coincidencias)
      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json({ items });
    } catch (err: any) {
      console.error("[placesAutocomplete] exception:", err.response?.data || err.message);
      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json({ items: [] });
    }
  });

export const placeDetails = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const { id, lang = "es", region = "AR", session } = req.query as Record<
        string,
        string | undefined
      >;

      console.log("[placeDetails] query:", { id, lang, region, session });

      const PLACES_API_KEY =
        process.env.PLACES_API_KEY ||
        ((functions as any).config?.() && (functions as any).config().google?.api_key);

      if (!id) {
        res.status(400).json({ error: "id required" });
        return;
      }
      if (!PLACES_API_KEY) {
        console.error("[placeDetails] Missing PLACES_API_KEY");
        res.status(500).json({ error: "missing_api_key" });
        return;
      }

      // Endpoint moderno de Places API (v1)
      const url = `https://places.googleapis.com/v1/places/${id}`;

      const headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,shortFormattedAddress",
      } as Record<string, string>;

      const response = await axios.get(url, { headers });
      const place = response.data || {};

      console.log("[placeDetails] provider:", {
        id: place.id,
        name: place.displayName?.text,
        address: place.formattedAddress,
      });

      const details = {
        id: place.id || "",
        name: place.displayName?.text || "",
        address: place.formattedAddress || place.shortFormattedAddress || "",
        lat: place.location?.latitude ?? 0,
        lng: place.location?.longitude ?? 0,
      };

      // Respuesta estándar esperada por el frontend
      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json(details);
    } catch (err: any) {
      console.error("[placeDetails] exception:", err.response?.data || err.message);
      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json({
        id: "",
        name: "",
        address: "",
        lat: 0,
        lng: 0,
      });
    }
  });
