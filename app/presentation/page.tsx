import { Deck } from "../../components/presentation/Deck";
import { MOTTO } from "../../components/presentation/slides";

export const metadata = {
  title: "Teardown presentation",
  description: MOTTO,
};

/** GitHub Pages serves the app under /teardown, so the deck's media paths need the same prefix. */
const MEDIA_BASE = `${(process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "")}/presentation/media/`;

/** Separate from Explore and Your mission. Not a third product mode. */
export default function PresentationPage() {
  return <Deck mediaBase={MEDIA_BASE} />;
}
