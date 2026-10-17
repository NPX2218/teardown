export function Credits({ className = "legal" }: { className?: string }) {
  return (
    <footer className={className}>
      <span>Made by Neel Bansal and Anders Haroldson</span>
      <span>Student project. Not affiliated with SpaceX or xAI.</span>
      <span>
        Model: &ldquo;Falcon 9 - SpaceX&rdquo; by Stanley Creative,{" "}
        <a className="hit" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY 4.0
        </a>
      </span>
      <span>
        Guide avatar:{" "}
        <a className="hit" href="https://github.com/jeremy-prt/bloub" target="_blank" rel="noopener noreferrer">
          bloub
        </a>{" "}
        by Jérémy Perret (MIT), an unofficial recreation of the Grok Bot. Not affiliated with xAI.
      </span>
      <span>Earth imagery: NASA Visible Earth (Blue Marble, Black Marble, clouds, and the land/water mask), public domain.</span>
    </footer>
  );
}
