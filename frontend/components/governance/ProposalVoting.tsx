"use client";

import { useState, useEffect } from "react";
import type { MouseEvent } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalVotes {
  yes: number;
  no: number;
  abstain: number;
}

export interface ProposalVotingProps {
  id?: string;
  title?: string;
  description?: string;
  endsIn?: string;
  quorumCurrent?: number;
  quorumRequired?: number;
  votes?: ProposalVotes;
  /** Called with the chosen vote once confirmed */
  onVoteConfirmed?: (vote: VoteChoice) => Promise<void>;
}

type VoteChoice = "yes" | "no" | "abstain";

// ─── Constants ────────────────────────────────────────────────────────────────

const CYAN = "#00f5ff";
const VIOLET = "#9d4edd";
const GLASS = "rgba(255,255,255,0.04)";

const DEFAULT_PROPOSAL: Required<ProposalVotingProps> = {
  id: "SIP-042",
  title: "Allocate 500,000 STRM to Protocol Liquidity Reserve",
  description:
    "This proposal seeks to allocate 500,000 STRM tokens from the Community Treasury to establish a Protocol Liquidity Reserve, ensuring stability during high-volatility periods.",
  endsIn: "2d 14h 22m",
  quorumCurrent: 67,
  quorumRequired: 75,
  votes: { yes: 4_812_340, no: 1_023_450, abstain: 342_100 },
  onVoteConfirmed: async () => {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

const KEYFRAMES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');

  @keyframes fadeUp        { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
  @keyframes pulse         { 0%,100% { opacity:1; } 50% { opacity:.4; } }
  @keyframes spin          { to { transform:rotate(360deg); } }
  @keyframes ripple        { from { transform:scale(0) translate(-50%,-50%); opacity:.5; } to { transform:scale(4) translate(-50%,-50%); opacity:0; } }
  @keyframes successPop    { 0%{transform:scale(.8);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
  @keyframes glowPulse     { 0%,100%{box-shadow:0 0 20px #00f5ff33} 50%{box-shadow:0 0 50px #00f5ff88,0 0 100px #00f5ff22} }
  @keyframes violetPulse   { 0%,100%{box-shadow:0 0 20px #9d4edd33} 50%{box-shadow:0 0 50px #9d4edd88,0 0 100px #9d4edd22} }
  @keyframes abstainPulse  { 0%,100%{box-shadow:0 0 10px rgba(255,255,255,.06)} 50%{box-shadow:0 0 24px rgba(255,255,255,.14)} }
  @keyframes scanline      { 0%{transform:translateY(-100%)} 100%{transform:translateY(300%)} }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .vote-btn { transition: transform .15s, box-shadow .2s, background .2s; }
  .vote-btn:hover:not(:disabled) { transform: translateY(-3px) scale(1.02); }
  .vote-btn:active:not(:disabled) { transform: scale(.97) !important; }

  .yes-btn:hover:not(.selected):not(:disabled) {
    box-shadow: 0 0 40px ${CYAN}55, 0 0 80px ${CYAN}22, inset 0 0 30px ${CYAN}11 !important;
    border-color: ${CYAN} !important;
  }
  .no-btn:hover:not(.selected):not(:disabled) {
    box-shadow: 0 0 40px ${VIOLET}55, 0 0 80px ${VIOLET}22, inset 0 0 30px ${VIOLET}11 !important;
    border-color: ${VIOLET} !important;
  }
  .abstain-btn:hover:not(.selected):not(:disabled) {
    box-shadow: 0 0 20px rgba(255,255,255,.12) !important;
    border-color: rgba(255,255,255,.3) !important;
  }

  .yes-btn.selected     { animation: glowPulse 2s ease-in-out infinite; }
  .no-btn.selected      { animation: violetPulse 2s ease-in-out infinite; }
  .abstain-btn.selected { animation: abstainPulse 2s ease-in-out infinite; }

  .confirm-btn { transition: all .2s; }
  .confirm-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
  .confirm-btn:active:not(:disabled) { transform: scale(.98) !important; }

  .fade-up-1 { animation: fadeUp .5s ease both; }
  .fade-up-2 { animation: fadeUp .5s .08s ease both; }
  .fade-up-3 { animation: fadeUp .5s .16s ease both; }
  .fade-up-4 { animation: fadeUp .5s .24s ease both; }
  .fade-up-5 { animation: fadeUp .5s .32s ease both; }
`;

// ─── Tally Row ────────────────────────────────────────────────────────────────

function TallyRow({
  label,
  votes,
  pct,
  color,
  delay = 0,
}: {
  label: string;
  votes: number;
  pct: number;
  color: string;
  delay?: number;
}) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 150 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            letterSpacing: 2,
            color: "rgba(255,255,255,.4)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color }}
        >
          {fmt(votes)} <span style={{ color: "rgba(255,255,255,.3)" }}>·</span>{" "}
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,.06)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${width}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            borderRadius: 99,
            boxShadow: `0 0 8px ${color}66`,
            transition: "width 1s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Vote Button ──────────────────────────────────────────────────────────────

interface VoteButtonProps {
  label: string;
  sublabel: string;
  color: string;
  className: string;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}

function VoteButton({
  label,
  sublabel,
  color,
  className,
  selected,
  onClick,
  disabled,
}: VoteButtonProps) {
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r: Array<{ id: number; x: number; y: number }>) => [
      ...r,
      { id, x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
    setTimeout(
      () =>
        setRipples((r: Array<{ id: number; x: number; y: number }>) =>
          r.filter((rr) => rr.id !== id),
        ),
      700,
    );
    onClick();
  };

  return (
    <button
      className={`vote-btn ${className} ${selected ? "selected" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      style={{
        position: "relative",
        flex: 1,
        height: 116,
        background: selected
          ? `linear-gradient(135deg, ${color}18, ${color}08)`
          : GLASS,
        border: `1px solid ${selected ? color : "rgba(255,255,255,.09)"}`,
        borderRadius: 16,
        cursor: disabled ? "default" : "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backdropFilter: "blur(12px)",
        boxShadow: selected
          ? `0 0 30px ${color}44, inset 0 0 20px ${color}0a`
          : "none",
      }}
    >
      {/* Scan line on selected */}
      {selected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "35%",
              background: `linear-gradient(180deg, ${color}18, transparent)`,
              animation: "scanline 2.5s linear infinite",
            }}
          />
        </div>
      )}

      {/* Ripples */}
      {ripples.map((r: { id: number; x: number; y: number }) => (
        <span
          key={r.id}
          style={{
            position: "absolute",
            left: r.x,
            top: r.y,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: `${color}44`,
            transformOrigin: "0 0",
            animation: "ripple .7s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      ))}

      <span
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 28,
          fontWeight: 800,
          color: selected ? color : "rgba(255,255,255,.8)",
          letterSpacing: -0.5,
          lineHeight: 1,
          transition: "color .2s",
          zIndex: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          color: selected ? `${color}bb` : "rgba(255,255,255,.28)",
          transition: "color .2s",
          zIndex: 1,
        }}
      >
        {sublabel}
      </span>
    </button>
  );
}

// ─── Success State ────────────────────────────────────────────────────────────

function SuccessState({ vote }: { vote: VoteChoice }) {
  const color = vote === "yes" ? CYAN : vote === "no" ? VIOLET : "#888899";
  const label = vote === "yes" ? "FOR" : vote === "no" ? "AGAINST" : "ABSTAIN";
  const icon = vote === "abstain" ? "◈" : "✓";

  return (
    <div
      style={{
        textAlign: "center",
        padding: "28px 0 8px",
        animation: "successPop .5s cubic-bezier(.34,1.56,.64,1) both",
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: `0 0 30px ${color}55, 0 0 60px ${color}22`,
          fontSize: 22,
          color,
        }}
      >
        {icon}
      </div>
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          letterSpacing: 3,
          color: "rgba(255,255,255,.35)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Vote recorded
      </p>
      <p
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 22,
          fontWeight: 800,
          color,
          letterSpacing: -0.5,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "rgba(255,255,255,.25)",
          marginTop: 8,
        }}
      >
        Transaction submitted · awaiting confirmation
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProposalVoting({
  id = DEFAULT_PROPOSAL.id,
  title = DEFAULT_PROPOSAL.title,
  description = DEFAULT_PROPOSAL.description,
  endsIn = DEFAULT_PROPOSAL.endsIn,
  quorumCurrent = DEFAULT_PROPOSAL.quorumCurrent,
  quorumRequired = DEFAULT_PROPOSAL.quorumRequired,
  votes = DEFAULT_PROPOSAL.votes,
  onVoteConfirmed = DEFAULT_PROPOSAL.onVoteConfirmed,
}: ProposalVotingProps) {
  const [vote, setVote] = useState<VoteChoice | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const total = votes.yes + votes.no + votes.abstain;
  const yesPct = +((votes.yes / total) * 100).toFixed(1);
  const noPct = +((votes.no / total) * 100).toFixed(1);
  const absPct = +((votes.abstain / total) * 100).toFixed(1);

  const quorumMet = quorumCurrent >= quorumRequired;
  const quorumPct = Math.min((quorumCurrent / quorumRequired) * 100, 100);
  const [quorumWidth, setQuorumWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setQuorumWidth(quorumPct), 400);
    return () => clearTimeout(t);
  }, [quorumPct]);

  const voteColor =
    vote === "yes"
      ? CYAN
      : vote === "no"
        ? VIOLET
        : vote === "abstain"
          ? "#666688"
          : null;

  const handleConfirm = async () => {
    if (!vote || submitting) return;
    setSubmitting(true);
    try {
      await onVoteConfirmed(vote);
      setConfirmed(true);
    } catch {
      // surface error handling to parent via onVoteConfirmed rejection
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        style={{
          minHeight: "100vh",
          background: "#06060f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient blobs */}
        <div
          style={{
            position: "fixed",
            top: -250,
            left: -250,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${CYAN}09 0%, transparent 65%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "fixed",
            bottom: -350,
            right: -250,
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${VIOLET}09 0%, transparent 65%)`,
            pointerEvents: "none",
          }}
        />

        {/* Card */}
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,.075)",
            borderRadius: 24,
            padding: "36px 36px 32px",
            backdropFilter: "blur(24px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top shimmer edge */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "8%",
              right: "8%",
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)",
            }}
          />

          {/* Header */}
          <div
            className="fade-up-1"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 22,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: CYAN,
                  display: "inline-block",
                  animation: "pulse 1.6s ease-in-out infinite",
                  boxShadow: `0 0 10px ${CYAN}`,
                }}
              />
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "rgba(255,255,255,.38)",
                  textTransform: "uppercase",
                }}
              >
                Live · {id}
              </span>
            </div>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                color: "rgba(255,255,255,.28)",
              }}
            >
              ⏳ {endsIn}
            </span>
          </div>

          {/* Title */}
          <h1
            className="fade-up-2"
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              lineHeight: 1.3,
              color: "#fff",
              marginBottom: 10,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </h1>

          {/* Description */}
          <p
            className="fade-up-3"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11.5,
              lineHeight: 1.7,
              color: "rgba(255,255,255,.35)",
              marginBottom: 24,
            }}
          >
            {description}
          </p>

          {/* Tally */}
          <div
            className="fade-up-3"
            style={{
              background: "rgba(255,255,255,.02)",
              border: "1px solid rgba(255,255,255,.055)",
              borderRadius: 14,
              padding: "18px 20px 6px",
              marginBottom: 24,
            }}
          >
            <TallyRow
              label="For"
              votes={votes.yes}
              pct={yesPct}
              color={CYAN}
              delay={0}
            />
            <TallyRow
              label="Against"
              votes={votes.no}
              pct={noPct}
              color={VIOLET}
              delay={120}
            />
            <TallyRow
              label="Abstain"
              votes={votes.abstain}
              pct={absPct}
              color="#666688"
              delay={240}
            />
          </div>

          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,.055)",
              marginBottom: 24,
            }}
          />

          {/* Vote or Success */}
          {!confirmed ? (
            <div className="fade-up-4">
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  color: "rgba(255,255,255,.28)",
                  textTransform: "uppercase",
                  textAlign: "center",
                  marginBottom: 14,
                }}
              >
                Cast your vote
              </p>

              {/* Three equal buttons — For / Against / Abstain */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <VoteButton
                  label="YES"
                  sublabel="For"
                  color={CYAN}
                  className="yes-btn"
                  selected={vote === "yes"}
                  onClick={() => setVote(vote === "yes" ? null : "yes")}
                  disabled={confirmed}
                />
                <VoteButton
                  label="NO"
                  sublabel="Against"
                  color={VIOLET}
                  className="no-btn"
                  selected={vote === "no"}
                  onClick={() => setVote(vote === "no" ? null : "no")}
                  disabled={confirmed}
                />
                <VoteButton
                  label="ABSTAIN"
                  sublabel="Abstain"
                  color="#666688"
                  className="abstain-btn"
                  selected={vote === "abstain"}
                  onClick={() => setVote(vote === "abstain" ? null : "abstain")}
                  disabled={confirmed}
                />
              </div>

              <button
                className="confirm-btn"
                onClick={handleConfirm}
                disabled={!vote || submitting}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 14,
                  border: voteColor
                    ? `1px solid ${voteColor}44`
                    : "1px solid rgba(255,255,255,.06)",
                  background: voteColor
                    ? `linear-gradient(135deg, ${voteColor}20, ${voteColor}0a)`
                    : "rgba(255,255,255,.03)",
                  color: vote ? "#fff" : "rgba(255,255,255,.2)",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  cursor: vote && !submitting ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: voteColor ? `0 0 20px ${voteColor}20` : "none",
                }}
              >
                {submitting ? (
                  <>
                    <span
                      style={{
                        display: "inline-block",
                        animation: "spin .7s linear infinite",
                      }}
                    >
                      ◌
                    </span>
                    Submitting…
                  </>
                ) : vote ? (
                  `Confirm · ${vote.toUpperCase()}`
                ) : (
                  "Select an option above"
                )}
              </button>
            </div>
          ) : (
            <SuccessState vote={vote!} />
          )}

          {/* Liquid Progress — Quorum */}
          <div className="fade-up-5" style={{ marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  color: "rgba(255,255,255,.28)",
                  textTransform: "uppercase",
                }}
              >
                Quorum
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: quorumMet ? CYAN : "rgba(255,255,255,.38)",
                }}
              >
                {quorumCurrent}% / {quorumRequired}% required
              </span>
            </div>

            <div
              style={{
                height: 6,
                background: "rgba(255,255,255,.05)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${quorumWidth}%`,
                  background: quorumMet
                    ? `linear-gradient(90deg, ${VIOLET}, ${CYAN})`
                    : `linear-gradient(90deg, ${VIOLET}77, ${CYAN}55)`,
                  borderRadius: 99,
                  transition: "width 1.3s cubic-bezier(.4,0,.2,1)",
                  boxShadow: quorumMet ? `0 0 14px ${CYAN}66` : "none",
                }}
              />
            </div>

            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                color: quorumMet ? `${CYAN}88` : "rgba(255,255,255,.2)",
                marginTop: 8,
                textAlign: "right",
              }}
            >
              {quorumMet
                ? "✓ Quorum reached — vote will be binding"
                : `${quorumRequired - quorumCurrent}% more needed`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
