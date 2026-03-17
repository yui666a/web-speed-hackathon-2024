/**
 * Minimal book data needed by card components (BookCard, FeatureCard, RankingCard).
 * This is the intersection of GetBookResponse, and the book objects embedded in
 * GetFeatureListResponse, GetRankingListResponse, and GetReleaseResponse.
 */
export type BookCardData = {
  id: string;
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    image: {
      id: string;
      alt: string;
    };
  };
  image: {
    id: string;
    alt: string;
  };
};
