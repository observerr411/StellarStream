import axios from "axios";
import { config } from "./config";

export interface MegaStreamEvent {
  streamId: string;
  sender: string;
  receiver: string;
  token: string;
  totalAmount: bigint;
  totalAmountXlm: string;
  startTime: number;
  endTime: number;
  txHash: string;
}

/** Formats a Discord embed and POSTs it to the configured webhook. */
export async function notifyMegaStream(event: MegaStreamEvent): Promise<void> {
  const durationDays = Math.round(
    (event.endTime - event.startTime) / 86_400
  );

  const payload = {
    username: "StellarStream 🌊",
    avatar_url: "https://stellar.org/favicon.ico",
    embeds: [
      {
        title: "🚀 Mega Stream Created",
        description:
          `A high-value stream has just been launched on **StellarStream**!`,
        color: 0x7c3aed, // purple
        fields: [
          {
            name: "💰 Total Amount",
            value: `**${event.totalAmountXlm} XLM**`,
            inline: true,
          },
          {
            name: "⏱ Duration",
            value: `${durationDays} day${durationDays !== 1 ? "s" : ""}`,
            inline: true,
          },
          {
            name: "🆔 Stream ID",
            value: `\`${event.streamId}\``,
            inline: true,
          },
          {
            name: "📤 Sender",
            value: `\`${event.sender}\``,
            inline: false,
          },
          {
            name: "📥 Receiver",
            value: `\`${event.receiver}\``,
            inline: false,
          },
          {
            name: "🔗 Transaction",
            value: `[View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/${event.txHash})`,
            inline: false,
          },
        ],
        footer: {
          text: "StellarStream • Real-time asset streaming on Stellar",
        },
        timestamp: new Date(event.startTime * 1000).toISOString(),
      },
    ],
  };

  await axios.post(config.discordWebhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
  });

  console.log(
    `[Discord] Mega Stream notification sent — Stream #${event.streamId} (${event.totalAmountXlm} XLM)`
  );
}
