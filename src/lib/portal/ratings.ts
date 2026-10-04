// Garage.averageRating / totalReviews are maintained incrementally (they can legitimately exceed
// the number of Review rows — e.g. seeded or imported history), so adding and removing a review
// are exact inverses of each other rather than a recompute from rows.

export interface RatingState {
  averageRating: number
  totalReviews: number
}

export function ratingAfterAdd(state: RatingState, rating: number): RatingState {
  const totalReviews = state.totalReviews + 1
  return { totalReviews, averageRating: (state.averageRating * state.totalReviews + rating) / totalReviews }
}

export function ratingAfterRemove(state: RatingState, rating: number): RatingState {
  if (state.totalReviews <= 1) return { totalReviews: 0, averageRating: 0 }
  const totalReviews = state.totalReviews - 1
  const averageRating = (state.averageRating * state.totalReviews - rating) / totalReviews
  return { totalReviews, averageRating: Math.min(5, Math.max(0, averageRating)) }
}
