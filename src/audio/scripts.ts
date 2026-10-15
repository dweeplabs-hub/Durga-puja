import type { SfxId, VoiceSlotId } from '../types';

export interface VoiceScript {
  /** Suggested ElevenLabs voice / delivery direction. */
  direction: string;
  /** Exact Bengali text to paste into ElevenLabs. */
  text: string;
}

const VOICE = 'ElevenLabs · Multilingual v2 · warm, energetic Bengali female game-show host';

/** Bengali announcement scripts for the 7 built-in slots (copy into ElevenLabs to generate the MP3s). */
export const VOICE_SCRIPTS: Record<VoiceSlotId, VoiceScript> = {
  MAIN_INTRO: {
    direction: `${VOICE}. Grand, celebratory, 60–90 seconds. Stability ~40%, style ~60%.`,
    text: `নমস্কার, নমস্কার, নমস্কার! সবাইকে জানাই উষ্ণ অভ্যর্থনা আজকের সবচেয়ে মজার, সবচেয়ে রোমাঞ্চকর প্রতিযোগিতায় — মজার মহাযুদ্ধ!

আজ আমাদের মঞ্চে নারীদের নিলাম প্রতিযোগিতা, যেখানে লাগবে বুদ্ধি, সাহস, আর একটু ভাগ্য। নিয়মগুলো মন দিয়ে শুনুন।

প্রত্যেক প্রতিযোগী শুরু করবেন একশো টোকেন নিয়ে। মোট দশটি খেলা হবে। প্রতিটি খেলার আগে আপনি ঠিক করবেন কত টোকেন বাজি রাখবেন — সর্বোচ্চ পঞ্চাশ টোকেন।

খেলায় প্রথম হলে বাজির চার গুণ টোকেন ফেরত, দ্বিতীয় হলে তিন গুণ, আর তৃতীয় হলে দুই গুণ! বাকিদের বাজি রাখা টোকেন — চলে যাবে মহাযুদ্ধের খাতায়!

টোকেন ফুরিয়ে গেলেও চিন্তা নেই — টোকেন লোন পাওয়া যাবে। আর জিতলেই প্রতিবার পুরস্কারের দুই শতাংশ কেটে নিয়ে লোন শোধ হয়ে যাবে।

দশটি খেলার শেষে যাঁর কাছে সবচেয়ে বেশি টোকেন থাকবে, তিনিই হবেন আজকের চ্যাম্পিয়ন!

তাহলে আর দেরি কেন? সবাই তৈরি তো? জোরে হাততালি দিয়ে শুরু হোক — মজার মহাযুদ্ধ!`,
  },
  BIDDING_OPEN: {
    direction: `${VOICE}. Upbeat and urgent, about 8–10 seconds.`,
    text: `মনোযোগ দিন সবাই! বিডিং এখন শুরু! আপনার টোকেন গুনে নিন, আর সাহস করে বাজি ধরুন। কত টোকেন রাখবেন — সিদ্ধান্ত আপনার! ঘড়ি কিন্তু চলছে!`,
  },
  THIRTY_SEC_LEFT: {
    direction: `${VOICE}. Tense, fast-paced warning, about 4–5 seconds.`,
    text: `সাবধান! আর মাত্র তিরিশ সেকেন্ড বাকি! যাঁরা এখনো বাজি ধরেননি, তাড়াতাড়ি করুন!`,
  },
  BIDDING_CLOSED: {
    direction: `${VOICE}. Firm and dramatic, about 6–8 seconds.`,
    text: `সময় শেষ! বিডিং এখন বন্ধ! সব বাজি লক করা হয়ে গেছে — আর কোনো পরিবর্তন চলবে না। এবার শুরু হোক আসল লড়াই!`,
  },
  LEADERBOARD_REVEAL: {
    direction: `${VOICE}. Excited reveal with a short pause after the first sentence, about 8–10 seconds.`,
    text: `অপেক্ষার অবসান! এই রাউন্ডের ফলাফল এসে গেছে! বিজয়ীদের জন্য জোরে হাততালি! আর দেখে নিন — লিডারবোর্ডে কে উঠলেন, আর কে নামলেন!`,
  },
  LOAN_ISSUED: {
    direction: `${VOICE}. Light and encouraging, about 4–5 seconds.`,
    text: `টোকেন লোন মঞ্জুর! লড়াই এখনো শেষ হয়নি — নতুন টোকেন নিয়ে আবার ময়দানে নামুন!`,
  },
  CHAMPION_CROWNED: {
    direction: `${VOICE}. Slow build-up with dramatic pauses at each "…", then a big celebratory finish, about 20–25 seconds.`,
    text: `এবার সেই মুহূর্ত, যার জন্য আমরা সবাই অপেক্ষা করছিলাম! দশটি রোমাঞ্চকর খেলার পর, মজার মহাযুদ্ধের চূড়ান্ত ফলাফল তৈরি!

দ্বিতীয় রানার্স-আপ… প্রথম রানার্স-আপ… আর আজকের চ্যাম্পিয়ন…

সবাই জোরে হাততালি দিন! অভিনন্দন আমাদের চ্যাম্পিয়নকে, আর ধন্যবাদ প্রত্যেক প্রতিযোগীকে — আপনারাই আজকের মহাযুদ্ধকে মজার করে তুলেছেন!`,
  },
};

/** Built-in synth effects used when a slot has no uploaded file (or in Synth / Both modes). */
export const SLOT_SYNTH: Record<VoiceSlotId, SfxId[]> = {
  MAIN_INTRO: ['FANFARE'],
  BIDDING_OPEN: ['COIN', 'FANFARE'],
  THIRTY_SEC_LEFT: ['TICK', 'TICK', 'TICK'],
  BIDDING_CLOSED: ['COIN', 'AIRHORN'],
  LEADERBOARD_REVEAL: ['FANFARE'],
  LOAN_ISSUED: ['COIN'],
  CHAMPION_CROWNED: ['DRUMROLL', 'FANFARE'],
};

export function isVoiceSlotId(id: string): id is VoiceSlotId {
  return id in VOICE_SCRIPTS;
}
