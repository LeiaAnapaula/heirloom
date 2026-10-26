import { Suspense } from "react";
import { notFound } from "next/navigation";
import StoryLoader, { SleepingBook } from "@/components/StoryLoader";
import { episodes } from "@/content/episodes/lost-star";

export function generateStaticParams() {
  return Object.keys(episodes).map((id) => ({ id }));
}

export default function EpisodePage(props: PageProps<"/episode/[id]">) {
  // The night sky and the closed book show instantly; the episode streams in behind them.
  return (
    <Suspense fallback={<SleepingBook waitingFor={null} />}>
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
