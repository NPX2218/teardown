"use client";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { formatClock } from "@/lib/flight/format";
import { historicalMissions } from "@/lib/flight/mission-select";
import { replayDataCaption, replayDuration, replayPose, referenceTrajectoryNote } from "@/lib/replay";
import { useScene } from "@/lib/store";
import type { Mission } from "@/lib/types";
import { EmissionsPlacement } from "@/components/flight/EmissionsPlacement";
import styles from "@/components/flight/flight.module.css";

function isSample(mission: Mission): boolean {
  return mission.kind !== "historical";
}

export function ReplayPanel() {
  const replay = useScene((s) => s.replay);
  const id = replay.missionId;
  const mission = id && Object.prototype.hasOwnProperty.call(MISSIONS, id) ? MISSIONS[id] : null;
  const duration = mission ? replayDuration(mission) : 0;
  const pose = mission ? replayPose(mission, replay.t) : null;

  const choose = (missionId: string) => {
    const scene = useScene.getState();
    scene.startReplay(missionId);
    scene.pauseReplay();
    useAppMode.getState().restartHeard();
  };
  const toggle = () => {
    const scene = useScene.getState();
    if (!scene.replay.missionId) return;
    if (scene.replay.playing) scene.pauseReplay();
    else scene.resumeReplay();
  };
  const seek = (time: number) => {
    useAppMode.getState().noteSeek(time);
    useScene.getState().setReplayTime(time);
  };
  const restart = () => {
    const scene = useScene.getState();
    scene.setReplayTime(0);
    scene.resumeReplay();
    useAppMode.getState().restartHeard();
  };

  return (
    <section className={`hud ${styles.readout}`} aria-label="Flight replay">
      <div className={styles.stack}>
        <p className="hud__k">Flight replay</p>
        <h2>Illustrated motion, not a recording.</h2>
        <p className={styles.note}>Drawn height, not a measured height. The flame is a drawing, not a measured burn.</p>
        <div className={styles.actions}>
          {Object.entries(MISSIONS).map(([missionId, item]) => (
            <button key={missionId} type="button" className="btn" aria-pressed={missionId === id} onClick={() => choose(missionId)}>
              {isSample(item) ? "Practice sample" : item.name}
            </button>
          ))}
          {historicalMissions(MISSIONS).length === 0 && (
            <button type="button" className="btn" disabled>Sentinel-6</button>
          )}
        </div>
        <p className={styles.note}>{mission ? replayDataCaption(mission) : "Data: Practice sample"}</p>
        {mission && referenceTrajectoryNote(mission) && <p className={styles.note}>{referenceTrajectoryNote(mission)}</p>}
        {pose && <p className={styles.note}>{pose.label}</p>}
        {mission && pose && (
          <>
            <p className="hud__v hud__v--clock" aria-label="Mission clock">{formatClock(replay.t)} / {formatClock(duration)}</p>
            <p>{pose.label}</p>
            <div className={styles.actions}>
              <button type="button" className="btn btn-accent" onClick={toggle}>{replay.playing ? "Pause" : "Play"}</button>
              <button type="button" className="btn" onClick={restart}>Restart</button>
              <button type="button" className="btn" onClick={() => { useScene.getState().stopReplay(); useAppMode.getState().restartHeard(); }}>Stop</button>
            </div>
            <label className="range">
              Mission time
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={Math.min(replay.t, duration)}
                aria-label="Seek mission time"
                onChange={(event) => seek(Number(event.target.value))}
              />
            </label>
            <ol className={styles.events}>
              {mission.events.map((event) => (
                <li key={`${event.id}-${event.t}`} className={styles.event} aria-current={pose.eventId === event.id && pose.t >= event.t ? "true" : undefined}>
                  <span>{formatClock(event.t)} · {event.label ?? event.id.replace(/_/g, " ")}</span>
                  <span>{event.say}</span>
                  {event.grouped && <span className={styles.badge}>Grouped milestones</span>}
                  {event.precision && <span className={styles.note}>{event.precision}</span>}
                  {event.sources?.map((source) => (
                    <a key={source.url} href={source.url}>{source.note ?? "Source"}</a>
                  ))}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <EmissionsPlacement />
    </section>
  );
}
