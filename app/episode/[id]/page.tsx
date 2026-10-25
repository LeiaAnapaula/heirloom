import { Suspense } from "react";
import { notFound } from "next/navigation";
import StoryLoader from "@/components/StoryLoader";
import { episodes } from "@/content/episodes/lost-star";

export function generateStaticParams() {
  return Object.keys(episodes).map((id) => ({ id }));
}

export default function EpisodePage(props: PageProps<"/episode/[id]">) {
  // The night sky shows instantly; the episode streams in behind it.
  return (
    <Suspense fallback={<main className="h-dvh bg-ink" />}>
      <EpisodeLoader params={props.params} />
    </Suspense>
  );
}

async function EpisodeLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const episode = episodes[id];
  if (!episode) notFound();
  return <StoryLoader episode={episode} />;
}
