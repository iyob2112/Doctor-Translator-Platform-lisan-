const paths = {
  video: <path d="m16 10 4.5-2.6a1 1 0 0 1 1.5.87v7.46a1 1 0 0 1-1.5.87L16 14M4 6h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />,
  voice: <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />,
  mic: <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />,
  micOff: <path d="m3 3 18 18M9 6a3 3 0 0 1 6 0v4M9 11a3 3 0 0 0 4.5 2.6M5 11a7 7 0 0 0 10.5 6M12 18v3" />,
  camOff: <path d="m3 3 18 18M16 10l4.5-2.6a1 1 0 0 1 1.5.87v7.46a1 1 0 0 1-.4.8M13 6a3 3 0 0 1 3 3v5M4 6h2m-3 1v10a1 1 0 0 0 1 1h9a3 3 0 0 0 2.4-1.2" />,
  hangup: <path d="M21 15.5v2.6a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-2.9 18.6 18.6 0 0 1-5.7-5.7A19 19 0 0 1 1.9 3.2 2 2 0 0 1 3.9 1h2.6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.6 8.8a15 15 0 0 0 5.6 5.6l1.2-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2ZM22 2 16 8" />,
  transfer: <path d="M4 8h13l-3-3m3 3-3 3M20 16H7l3-3m-3 3 3 3" />,
  notes: <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 8h6M9 12h6M9 16h3" />,
  star: <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.9L12 3.6Z" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" />,
  users: <path d="M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2.5 20a7.5 7.5 0 0 1 15 0M17 4.6a4 4 0 0 1 0 6.8M19 20a6.5 6.5 0 0 0-2-4.7" />,
  building: <path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M15 10h3a2 2 0 0 1 2 2v9M8 8h3M8 12h3M8 16h3M3 21h18" />,
  globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2" />,
  activity: <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />,
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z" />,
  check: <path d="m5 13 4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />,
  shield: <path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6l7-3Zm-2.5 9 2 2 4-4.5" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />,
  stetho: <path d="M6 3v5a4 4 0 0 0 8 0V3M8 3H4m8 0h-2m0 9v2a6 6 0 0 0 6 6h.5a3.5 3.5 0 0 0 3.5-3.5V13M20 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />,
  language: <path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5M7 10c1 3 3.5 5 6 6M13 20l4-9 4 9M14.6 17h4.8" />,
  bolt: <path d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  coin: <path d="M12 3c4.4 0 8 1.8 8 4s-3.6 4-8 4-8-1.8-8-4 3.6-4 8-4Zm8 8c0 2.2-3.6 4-8 4s-8-1.8-8-4m16 4c0 2.2-3.6 4-8 4s-8-1.8-8-4m16 4c0 2.2-3.6 4-8 4s-8-1.8-8-4" />,
  flag: <path d="M5 21V4m0 0h10l-1.5 4L15 12H5" />,
  key: <path d="M8.5 15.5 3 21m2-2-2 2m12.5-10.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm0 0 4.5 4.5V18h-2v-1.5H16" />,
  trash: <path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13" />,
  upload: <path d="M12 16V5m0 0 4 4M12 5 8 9M4 19h16" />,
  chat: <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
};

export default function Icon({ name, className = "h-5 w-5", strokeWidth = 1.7, ...rest }) {
  const content = paths[name];
  if (!content) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {content}
    </svg>
  );
}
