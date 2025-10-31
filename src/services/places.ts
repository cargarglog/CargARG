import * as functions from "firebase-functions";
import axios from "axios";

// 🔑 Usa tu clave desde variables de entorno
const PLACES_API_KEY = process.env.PLACES_API_KEY || functions.config().google?.api_key;
if (!PLACES_API_KEY) {
  console.warn("⚠️ No se encontró PLACES_API_KEY en el entorno de funciones.");
}

/**
 * Autocompletado de lugares — llama a la API oficial de Google Places
 * Recibe: q, lang, region, session
 * Devuelve: { items: [ { id, label, address } ] }
 */
export const placesAutocomplete = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const { q, lang = "es", region = "AR", session } = req.query;

      if (!q) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }
      if (!PLACES_API_KEY) {
        return res.status(500).json({ error: "Missing Google API key" });
      }

      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/place/autocomplete/json",
        {
          params: {
            input: q, // Google espera 'input'
            language: lang,
            components: `country:${region}`,
            sessiontoken: session,
            key: PLACES_API_KEY,
          },
        }
      );

      const items = (response.data.predictions || []).map((p) => ({
        id: p.place_id,
        label: p.description,
        address: p.description,
      }));

      return res.json({ items });
    } catch (err) {
      console.error("❌ PlacesAutocomplete error:", err.response?.data || err.message);
      return res.status(400).json({ error: err.response?.data || err.message });
    }
  });

/**
 * Detalles de lugar — obtiene coordenadas y dirección completa
 * Recibe: id (place_id), lang, region, session
 * Devuelve: { id, name, address, lat, lng }
 */
export const placeDetails = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    try {
      const { id, lang = "es", region = "AR", session } = req.query;

      if (!id) {
        return res.status(400).json({ error: "Missing query parameter 'id'" });
      }
      if (!PLACES_API_KEY) {
        return res.status(500).json({ error: "Missing Google API key" });
      }

      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/place/details/json",
        {
          params: {
            place_id: id,
            language: lang,
            region,
            sessiontoken: session,
            fields: "place_id,name,formatted_address,geometry/location",
            key: PLACES_API_KEY,
          },
        }
      );

      const r = response.data.result;
      if (!r) {
        return res.status(404).json({ error: "Place not found" });
      }

      const details = {
        id: r.place_id,
        name: r.name,
        address: r.formatted_address,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
      };

      return res.json(details);
    } catch (err) {
      console.error("❌ PlaceDetails error:", err.response?.data || err.message);
      return res.status(400).json({ error: err.response?.data || err.message });
    }
  });
