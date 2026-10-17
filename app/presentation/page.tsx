import { Deck } from "../../components/presentation/Deck";
import { MOTTO } from "../../components/presentation/slides";

export const metadata = {
  title: "Teardown presentation",
  description: MOTTO,
};

/** Separate from Explore, Flight replay and Your mission. Not a fourth product mode. */
export default function PresentationPage() {
  return <Deck />;
}
