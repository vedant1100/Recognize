/// <reference types="@googleworkspace/meet-addons" />

let _sdk: typeof google.meet.addon | null = null;

export async function initMeetSDK(): Promise<typeof google.meet.addon> {
  if (_sdk) return _sdk;
  await new Promise<void>((resolve) => {
    if (typeof google !== "undefined" && google.meet?.addon) {
      resolve();
    } else {
      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/meetaddon/api/meet_addon.js";
      script.onload = () => resolve();
      document.head.appendChild(script);
    }
  });
  _sdk = google.meet.addon;
  return _sdk;
}

export async function getMeetingCode(): Promise<string> {
  const sdk = await initMeetSDK();
  const session = await sdk.getMeetingSession();
  return session.meetingCode;
}
