interface Place {
  latitude?: number | null
  longitude?: number | null
  address: string
  city: string
  postcode: string
}

/** A "get directions" link: coordinates when we have them, else the written address. No map is embedded. */
export function directionsUrl(place: Place): string {
  const destination =
    typeof place.latitude === "number" && typeof place.longitude === "number"
      ? `${place.latitude},${place.longitude}`
      : [place.address, place.city, place.postcode].filter(Boolean).join(", ")
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
