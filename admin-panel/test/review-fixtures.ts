import { REVIEW_STEPS, type ReviewMedia } from "../shared/review-media.js";
export const reviewMediaFixture: ReviewMedia = Object.fromEntries(REVIEW_STEPS.map(step => [step.id, {
  key: `file-${step.id}`, url: `https://test.ufs.sh/f/file-${step.id}`, name: `${step.id}.${step.id === "video" ? "webm" : "jpg"}`,
  size: 100, mime: step.id === "video" ? "video/webm" : "image/jpeg", uploadedAt: "2026-10-02T08:00:00.000Z", uploadedBy: "76561198000000001",
}]));
