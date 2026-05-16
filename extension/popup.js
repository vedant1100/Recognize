// Check if currently on a Google Meet tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const statusEl = document.getElementById("status");

  if (tab && tab.url && tab.url.includes("meet.google.com")) {
    statusEl.textContent = "Active";
    statusEl.style.color = "#34a853";
  } else {
    statusEl.textContent = "Not on Meet";
    statusEl.style.color = "rgba(255,255,255,0.4)";
  }
});
