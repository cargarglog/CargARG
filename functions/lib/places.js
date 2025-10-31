"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.placeDetails = exports.placesAutocomplete = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const axios_1 = __importDefault(require("axios"));
exports.placesAutocomplete = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
    try {
        const { q, lang = "es", region = "AR", session } = req.query;
        console.log("[placesAutocomplete] query:", { q, lang, region, session });
        const PLACES_API_KEY = process.env.PLACES_API_KEY ||
            (functions.config?.() && functions.config().google?.api_key);
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
        };
        const response = await axios_1.default.post(url, body, { headers });
        const { suggestions } = response.data || {};
        console.log("[placesAutocomplete] provider:", {
            count: suggestions?.length || 0,
        });
        const items = Array.isArray(suggestions)
            ? suggestions.map((s) => ({
                id: s.placePrediction?.placeId,
                label: s.placePrediction?.text?.text,
                address: s.placePrediction?.structuredFormat?.mainText?.text ||
                    s.placePrediction?.text?.text,
            }))
            : [];
        // Devuelve resultados (o vacío si no hay coincidencias)
        res.set("Access-Control-Allow-Origin", "*");
        res.status(200).json({ items });
    }
    catch (err) {
        console.error("[placesAutocomplete] exception:", err.response?.data || err.message);
        res.set("Access-Control-Allow-Origin", "*");
        res.status(200).json({ items: [] });
    }
});
exports.placeDetails = functions
    .region("us-central1")
    .https.onRequest(async (req, res) => {
    try {
        const { id, lang = "es", region = "AR", session } = req.query;
        console.log("[placeDetails] query:", { id, lang, region, session });
        const PLACES_API_KEY = process.env.PLACES_API_KEY ||
            (functions.config?.() && functions.config().google?.api_key);
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
            "X-Goog-FieldMask": "id,displayName,formattedAddress,location,shortFormattedAddress",
        };
        const response = await axios_1.default.get(url, { headers });
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
    }
    catch (err) {
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
//# sourceMappingURL=places.js.map