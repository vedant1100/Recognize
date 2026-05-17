## Inspiration
Every meeting ended the same way. Three days later someone asks "wait, what did we actually decide?" and nobody can answer. Transcription tools give you a wall of text with no names on it. Speaker attribution in real-time multi-person video calls has been an open research problem since the 1990s and every solution requires dedicated hardware or pre-enrolled voice profiles. We wanted to solve it from scratch, in Google Meet, with a regular webcam.

## What it does
Recognize figures out who said what at the word level, in real time, and feeds everything into a 3D knowledge graph that builds up your team's memory across every meeting you've ever had. You can query it in plain language and get cited answers in under a second. A post-meeting agent emails contradictions and action items automatically. An analytics dashboard shows contribution, efficiency, and idea coverage per person.

## How we built it
A Chrome extension captures Google Meet audio and video at the same time. MediaPipe tracks 478 facial landmarks per face per frame and measures lip movement variance. The face moving most is the active speaker. Groq Whisper returns every word with millisecond timestamps. We sync them and every word gets a name attached, in real time, no voice enrollment, no hardware needed. After the meeting everything ingests into a Neo4j knowledge graph through FastAPI. Claude extracts entities and relationships, embeddings deduplicate concepts across sessions. The frontend is a force-directed 3D graph in Three.js with a GraphRAG chat panel, voice input via VoiceOS, and a full analytics dashboard. TokenRouter handles LLM routing. Deployed on Zeabur. Built with AdaL.

## Challenges we ran into
The sync layer was brutal. Whisper and MediaPipe run on completely independent clocks so getting word timestamps and lip movement timelines to agree across network latency and frame drops took a lot of work. We anchored everything to a monotonic server clock and tuned a 300ms attribution window. Entity deduplication at 0.90 cosine similarity also took a while to get right so "ML" and "machine learning" merge correctly without collapsing things that are actually different. 3D performance needed instanced mesh rendering and moving the force simulation to a web worker.

## Accomplishments that we're proud of
Getting speaker diarization to actually work with no voice enrollment and no hardware on a standard webcam. The full pipeline from someone speaking in a Google Meet call to attributed, searchable, visualised knowledge with zero human involvement is something we did not expect to be this clean by the end of a hackathon.

## What we learned
The hardest part of any real-time system is not the AI, it is the clock. Graph databases completely change how you think about storing knowledge. And geometric approaches to AI are underused. Our entire diarization system has no learned audio components at all, which means it works regardless of language or accent.

## What's next for Recognize.AI
Live in-meeting intelligence that flags contradictions and resurfaces relevant context while the call is still happening. Meeting quality scoring. Zoom and Teams support. Slack and Notion integrations. And a knowledge graph that tells you before you make a decision that your team already talked about this two months ago.
