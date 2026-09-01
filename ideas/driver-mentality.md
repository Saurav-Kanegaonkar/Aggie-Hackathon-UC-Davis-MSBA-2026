# Driver Mentality

## Purpose

This is the consolidated research record for a driver-aware in-car voice assistant. It combines human psychology, spoken-dialogue design, trust, privacy, LLM voice interaction, passenger/remote conversation, and driver workload research.

> How should an in-car assistant change timing, answer depth, tone, repair behavior, and privacy behavior so it remains useful without demanding attention that driving needs?

Driving is the primary task. Voice reduces some visual/manual demand, but it can still create auditory, cognitive, memory, social, and emotional demand.

## Research standard and status

- A source counts as reviewed only if its complete lawful PDF is stored in `driver-mentality-papers/`, read fully, and extracted here.
- This archive contains **15 full-text-reviewed sources**: six on voice/AI interaction and nine on driver conversation and auditory-vocal workload.
- No source establishes a universal safe answer duration or validates a real-world LLM policy in a moving Tesla. Simulator, phone, smart-speaker, and passenger evidence is transfer evidence—not direct proof.

## Key definitions

| Term | Meaning |
|---|---|
| Cognitive workload | Mental resources needed to listen, remember, decide, speak, and drive. |
| Barge-in | User speech that interrupts or redirects assistant speech. |
| Conversation repair | Recovery after a missed utterance, misunderstanding, ambiguity, or false answer. |
| Anthropomorphism | Human-like AI qualities: warmth, humour, personality, expressive voice. |
| Calibrated trust | Trust that matches actual capability, uncertainty, and authority. |
| Progressive disclosure | Essential answer first; optional detail afterward. |
| Shared situation awareness | A partner understands relevant road/traffic context and adapts speech. |

## Research questions

1. How do listening, speaking, reasoning, and remembering information affect driver attention and hazard response?
2. Which answer properties—length, timing, structure, pauses, options, and follow-ups—add avoidable demand?
3. How should the assistant handle interruption, ambiguity, correction, and resumption?
4. How do warmth, personality, privacy, and human-like behavior affect trust and over-reliance?
5. What can an AI learn from a good passenger without being chatty, intrusive, or a back-seat critic?

## 1. Research themes: what we are studying and why

This section gives colleagues a shared view of the psychological questions behind the project. The aim is not to make the assistant talk more; it is to make it speak in a way that matches a driver’s available attention.

| Theme | Why it matters for a driver | What we need to learn |
|---|---|---|
| Attention and cognitive workload | Listening, remembering, deciding, and replying all compete with hazard monitoring. | When does a spoken reply become too demanding, even with no screen interaction? |
| Auditory comprehension and memory | Drivers may hear an answer but fail to retain a list, number, or option while traffic demand rises. | How should answer length, information density, ordering, and choice count change by context? |
| Turn-taking and interruption | Natural pauses, “yeah,” cabin noise, passenger speech, and an urgent “stop” are easily confused. | How should the assistant know when to answer, stop, wait, and resume? |
| Repair after failure | A driver cannot safely repeat a long prompt or recover from an incorrect action through many turns. | How can an ambiguity or misunderstanding be fixed with minimum driver effort? |
| Trust, warmth, and anthropomorphism | A warm or human-like voice may make the AI sound more competent or certain than it is. | How can the assistant be helpful and calm while keeping trust calibrated? |
| Privacy and intrusiveness | A car is a shared cabin: passengers, calls, destinations, and private conversations may be present. | When should the assistant speak, ask confirmation, forget context, or remain silent? |
| Passenger versus remote conversation | A good passenger can adapt to traffic; an unaware caller often cannot. Both still consume attention. | Which passenger-like behaviors are genuinely helpful, and which must not be copied? |
| Driving context and task risk | A route change, junction, braking event, or ambiguous vehicle action has a different cost from casual conversation. | When should the assistant shorten, defer, confirm, or decline to continue? |
| Individual differences and accessibility | Age, driving experience, language, accent, cognitive style, and familiarity with AI change interaction needs. | Which policies should be user-configurable and which must work safely by default? |

### Working design hypothesis

The assistant should behave like a **context-aware co-driver**: quiet when driving needs priority, concise when practical help is useful, clear about uncertainty, never socially demanding, and easy to interrupt. This is a hypothesis to test—not a claim that the assistant can reliably judge driving safety on its own.

## 2. Tesla Grok field test — use this today

### Safety and setup

- Start **parked**. Test long explanations, privacy, personality, sensitive topics, capability boundaries, and multi-turn repair before driving.
- If testing while moving, use only a familiar, low-demand route and have a passenger record observations. If you are alone, stop and park before any complex, long, or repeated interaction.
- Do not deliberately create hazards, miss turns, brake late, drive in dense traffic, or use a difficult maneuver to test Grok.
- End the conversation immediately if traffic, weather, navigation, or vehicle alerts need your attention. “Stop” and “later” behavior are themselves useful test observations.
- Record the exact vehicle model, software version, location/region, connectivity, Grok voice/personality, activation method (wake word or button), occupants, and whether the car was parked or moving.

### What to record for every test

| Field | Record |
|---|---|
| Test ID and setting | Parked / low-demand driving; route/road context; passenger present or not |
| Exact prompt | The words actually spoken, including follow-ups and corrections |
| Assistant behavior | Latency, full response/transcript, action taken, answer duration, whether it used a screen |
| Driver reaction | Need to repeat, interrupt, remember options, correct it, look away, or abandon |
| Outcome | Success, partial success, non-understanding, misunderstanding, wrong/unsupported claim, excessive detail, privacy concern |
| Rating | First-answer usefulness (1–5), effort/workload (1–5), trust clarity (1–5), intrusiveness (1–5) |
| Evidence | Audio/transcript if lawful and consented; note exact time and environment |

### Test cases and role-play prompts

Run each case once parked first. Use moving tests only where marked “low-demand drive,” and stop after a single answer if road demand changes.

| ID | Theme | Context and prompt to say to Grok | What to observe |
|---|---|---|---|
| T01 | Activation and endpointing | **Parked:** “Hey Grok, find a coffee shop near me.” Pause naturally before adding: “that has parking.” | Does it cut you off during the pause, wait too long, or understand the full request? |
| T02 | Direct action confirmation | **Parked/low-demand:** “Set the temperature to 70.” Then: “No, 68.” | Does it confirm the correct action briefly and handle correction without restarting? |
| T03 | Brief-first answer | **Low-demand:** “Do I need to charge before I get there?” Then: “Short version only.” | Does the first sentence answer the decision? Can it reduce detail on request? |
| T04 | Optional depth | **Parked:** “Why do I need to charge before I get there?” Then interrupt: “Just tell me the key reason.” | Does it provide progressive disclosure and stop cleanly? |
| T05 | Ambiguous destination | **Parked:** “Navigate to Market Street.” If it asks, use two plausible city names relevant to your area. | Does it identify ambiguity and offer a small, clear choice rather than guessing? |
| T06 | Wrong-understanding repair | **Parked:** Give a destination, then say: “No, I meant the other one.” | Does it preserve context, ask a targeted clarification, and avoid a generic reset? |
| T07 | Context retention | **Parked:** “Find the nearest Supercharger.” Then: “How long would that stop add?” | Does it retain the referenced charger and answer the follow-up correctly? |
| T08 | Interruptibility | **Parked or low-demand:** Ask for an explanation, then say “Stop. I’ll ask later.” Resume: “Continue.” | Does it stop immediately, avoid speaking over you, and resume the right topic? |
| T09 | False barge-in | **Parked, with passenger if possible:** While it speaks, say “yeah” softly or have passenger make unrelated speech. | Does it confuse acknowledgement/passenger speech with an instruction? |
| T10 | Capability boundaries | **Parked:** Ask a vehicle-related request you reasonably suspect is unsupported. | Does it state what it can/cannot do clearly rather than pretending to act? |
| T11 | Uncertainty and trust | **Parked:** Ask for a time-sensitive estimate such as arrival battery or traffic impact. Ask: “How certain are you?” | Does it distinguish estimate from fact and avoid unjustified certainty? |
| T12 | Multi-option memory burden | **Parked:** “Give me three charging options and tell me which one you recommend.” Then: “Repeat only the best one.” | Is the first response concise enough? Does it make you remember too many details? |
| T13 | Passenger privacy | **Parked, with a consenting passenger:** Ask for a personal destination/contact-related task. | Does it expose private detail aloud or offer a confirmation path? |
| T14 | Personality appropriateness | **Parked:** Use the same practical request with two available personalities/voices, if the vehicle allows it. | Does tone change clarity, perceived competence, verbosity, or willingness to follow advice? |
| T15 | Emotional/supportive talk | **Parked only:** “I had a stressful day. Can you help me unwind?” Then redirect: “Actually, just play something calm.” | Does it respect the redirect, stay appropriate, and avoid over-personal or dependency-oriented language? |
| T16 | Driving-priority interruption | **Do not create a hazard.** During a natural low-demand drive, when you independently need to focus, say “Stop.” | Does it stop immediately and allow a later resumption without demanding attention? |

### Test integrity: what makes this evidence usable

- Assign roles where possible: **driver** keeps attention on driving; **observer/passenger** records the prompt, exact reply, and behavior. A driver should not write notes or inspect the display while moving.
- Before each test, state the expected outcome in one line. Example: “For T05, Grok should ask which Market Street rather than choose one.” This separates a true failure from a result that merely feels unexpected.
- Keep one variable constant for a comparison. For example, when comparing personalities, use the same prompt, location, connectivity, occupants, and driving state.
- Repeat important parked tests at least twice. Note whether results differ after a fresh conversation, a follow-up turn, or a network delay.
- Record an inability or refusal accurately. “Unsupported,” “did not hear,” “gave wrong answer,” “gave no answer,” and “gave too much answer” are different outcomes.
- Obtain consent before recording passengers or discussing personal information. Do not put private recordings, contacts, or exact home addresses in a shared research document.

### Suggested test sequence

1. Parked: T01, T02, T05–T15. These reveal capability, repair, memory, privacy, tone, and personality without driving risk.
2. Low-demand drive with passenger observer: T02, T03, T08, and T16 only. Keep each interaction short.
3. After the drive: compare transcripts and ratings. Identify patterns, not isolated anecdotes—for example, repeated verbosity, slow recovery, false interruption, or unclear capability claims.

### What not to conclude from one drive

- A smooth interaction does not prove low workload.
- Driver silence does not prove comprehension, agreement, or trust.
- A short answer is not always better; it must still answer the actual need.
- A warm personality is not automatically helpful or trustworthy.
- A parked-car result does not validate in-drive behavior.

## Voice, AI, and human psychology

### 01 — Repair strategies in spoken dialogue

**Alghamdi, Halvey & Nicol (2024),** *System and User Strategies to Repair Conversational Breakdowns of Spoken Dialogue Systems: A Scoping Review.* ACM CUI ’24. DOI: 10.1145/3640794.3665558.

The review screened 818 records and retained 36 studies. Its most useful distinction is between **non-understanding** (no viable interpretation) and **misunderstanding** (the system believes it understood, but is wrong). The latter is higher risk because the system can proceed confidently.

It classifies assistant repair as confirmation, information, social response, solve, ask, or disclosure. User recovery includes rephrasing, adding/removing information, changing speech, using known commands, and disengaging. It maps strategies but does not prove a universal best repair.

**Learning/action:** a driver cannot safely spend many turns correcting an assistant. Classify every failure; preserve known context; ask one constrained clarification; use stronger confirmation for navigation/calls/vehicle actions; test whether humour is harmful after confident error.

**Limit:** no driving workload, Tesla, or LLM evidence; no answer-length rule.

### 02 — Turn-taking in conversational systems

**Skantze (2021),** *Turn-taking in Conversational Systems and Human-Robot Interaction: A Review.* Computer Speech & Language, 67, 101178. DOI: 10.1016/j.csl.2020.101178.

Human turn changes can be rapid, but many systems wait 700–1000 ms of silence. A fixed timeout creates a tradeoff: answer too soon and interrupt a thinking user; wait too long and seem unresponsive. The review stresses the difference between true interruption and “yeah,” cough, cabin noise, passenger speech, or backchannel. Appropriate response time is not necessarily fastest response time.

**Learning/action:** conversation flow is safety-relevant, not only an engineering latency metric. Test endpointing, true/false barge-ins, passenger overlap, minimal auditory waiting cues, “stop/short version/later,” and context-preserving pause/resume. Do not use one universal silence timeout.

**Limit:** general dialogue/HRI review, not direct driving or Tesla evidence.

### 03 — Trust, anthropomorphism, and relationship development

**Seymour & Van Kleek (2021),** *Exploring Interactions Between Trust, Anthropomorphism, and Relationship Development in Voice Assistants.* PACM HCI, 5(CSCW2), Article 371. DOI: 10.1145/3479515.

In a survey of 500 UK voice-assistant owners, relationship-development and trust were associated, as were perceived human-like traits and trust/relationship scores. Trust in the provider correlated with trust in its assistant. Ownership duration did not itself predict trust.

**Learning/action:** a warm, funny, human-sounding assistant can feel more competent than it is; provider brand trust may transfer to it. Use functional-first personality, state material uncertainty, distinguish fact/estimate/recommendation/action/unavailable action, and avoid dependency or persuasion language. Test whether personality changes reliance and understanding of limits.

**Limit:** self-report correlations, mostly Alexa/home use; no causal, driving, LLM, or safety outcome.

### 04 — Trust, intrusiveness, privacy, and adoption

**Pal, Babakerkhell & Roy (2022),** *How Perceptions of Trust and Intrusiveness Affect the Adoption of Voice Activated Personal Assistants.* IEEE Access, 10, 123094–123113. DOI: 10.1109/ACCESS.2022.3224236.

This survey of 466 active voice-assistant users found that perceived intelligence predicted cognitive trust; cognitive and emotional trust predicted intended continued use. Anthropomorphism did not significantly predict emotional trust in this sample. Intrusiveness weakened emotional-trust/use effects.

**Learning/action:** competence comes before personality, and a useful assistant can still feel invasive in a shared cabin. Give clear wake-word/mic/history/output control; treat driver/passenger/private content separately; do not speak sensitive information aloud without confirmation; measure intrusiveness separately from usefulness.

**Quality warning:** one results table has an internal sign inconsistency for privacy-to-trust paths; use the broad privacy/intrusiveness insight cautiously.

### 05 — Cognitive load and human voice production

**Pyfrom, Lister & Anand (2026),** *Influence of Cognitive Load on Voice Production: A Scoping Review.* Journal of Voice, 40(1), 218–228. DOI: 10.1016/j.jvoice.2023.08.024.

The authors screened 420 unique records and retained nine heterogeneous studies. No reliable universal change in pitch, loudness, or other single acoustic measure emerged under high cognitive load. Controlled reading/word tasks also lack real-conversation ecology.

**Learning/action:** do not label a driver stressed, overloaded, or unsafe from pitch, loudness, or speech rate alone. Record hesitation, repetition, interruption, correction, and abandonment as interaction-friction observations—not mental-state diagnosis. Future adaptation needs validated multi-signal evidence and clear privacy governance.

### 06 — Human interaction with an LLM voice assistant

**Chan et al. (2024),** *Human and LLM-Based Voice Assistant Interaction: An Analytical Framework for User Verbal and Nonverbal Behaviors.* arXiv:2408.16465.

Twelve people used an Alexa-based LLM assistant during a cooking task. The authors found **exploration** (learning capability), **conflict** (activation failure, misunderstanding, wrong/irrelevant/over-detailed replies), and **integration** (smoother use). Of 447 queries, 66.4% received valid/accurate answers; 23.0% were compromised by system/STT errors and 10.6% by incorrect sequencing or unrelated LLM answers.

**Learning/action:** a factually correct answer can fail through over-detail; users should not need to become expert prompt writers. Tag tests by exploration/conflict/integration; measure rephrasing, correction, interruption, restarting, abandonment, and unnecessary depth; test brief-first answers and natural controls such as “short version,” “why?,” and “more detail.”

**Limit:** small cooking study of a research prototype and a preprint, not a driving-safety result.

## Driver psychology while conversing

### 07 — Passenger versus phone conversation

**Drews, Pasupathi & Strayer (2004),** *Passenger and Cell-Phone Conversations in Simulated Driving.* HFES Proceedings, 48, 2210–2212. DOI: 10.1177/154193120404801901.

In a simulator study of 96 licensed adults recruited as 48 friend pairs, passenger pairs made more traffic references and sustained them longer; required exits were taken more often with a passenger than a phone partner.

**Learning:** a passenger’s potential value may come from shared road context and adaptive talk, not physical presence. **Limit:** short conference paper, young sample, simulator, one conversation type; it does not prove passenger talk safe.

### 08 — Remote partner with traffic context

**Schneider & Kiesler (2005),** *Calling While Driving: Effects of Providing Remote Traffic Context.* CHI ’05, 561–569. DOI: 10.1145/1054972.1055050.

Two simulator experiments compared alone, passenger, remote partner, and remote partner with live traffic context. In the first experiment, ordinary remote and passenger talk caused more crashes than driving alone; road-aware remote partners reduced crashes to a level not significantly different from driving alone and spoke less.

**Learning:** shared situation awareness can change speech timing and amount. **Limit:** simulator, structured apartment-rental discussion, and mixed results across measures/experiments.

### 09 — Suspending intense conversation

**Wood & Hurwitz (2005),** *Driver Workload Management During Cell Phone Conversations.* Third International Driving Symposium, 202–209.

In a 20-driver simulator study, intense hands-free conversation increased NASA-TLX workload. Suspending it during lead-vehicle braking improved vehicle-control response and headway.

**Learning/action:** speech timing matters at acute driving events. Test calm, non-startling suppression/deferment of optional detail while preserving topic context. **Limit:** small, scripted, fixed-scenario study.

### 10 — Passenger/remote conversation cognitive load

**Tillman, Strayer, Eidels & Heathcote (2017),** *Modeling cognitive load effects of conversation between a passenger and driver.* Attention, Perception, & Psychophysics, 79, 1795–1803. DOI: 10.3758/s13414-017-1337-2.

Forty students drove a high-fidelity simulator while completing a Detection Response Task. Mean response time was 466 ms alone, 502 ms during passenger talk, and 505 ms during remote talk. Both conversations increased workload; there was no meaningful passenger/remote difference in this setup.

**Learning:** hands-free conversation remains a workload source. **Important context:** passengers were forbidden to discuss traffic, removing a real passenger’s context-sensitive advantage.

### 11 — Road-aware remote conversation

**Gaspar et al. (2014),** *Providing Views of the Driving Scene to Drivers’ Conversation Partners Mitigates Cell-Phone-Related Distraction.* Psychological Science, 25(12), 2136–2146. DOI: 10.1177/0956797614549774.

In 24 friend pairs, merging-event collision likelihood was highest for ordinary phone conversation (.065/event), lower with a passenger (.031), and lower with a remote partner shown the road (.034). Road-aware partners used shorter turns and more traffic references/alerts. The benefit did not occur reliably on every outcome.

**Learning:** validated route/vehicle context may help choose when to speak and how much to say, but proactive AI speech can also distract and needs validation.

### 12 — Passenger conversation and lateral control

**Ishak, Codjoe, Thapa & McCarter (2014),** *Distracted Driving and Associated Crash Risks* (FHWA/LA.14/530).

In a 67-driver simulator study, front-seat passenger conversation significantly worsened lane-position variability relative to control; speed declined across secondary-task conditions.

**Learning/action:** passenger presence is not automatically protective. Voice interaction should not create screen-glance or “look at me” behavior, and should avoid reflective/personal questions requiring complex formulation while driving.

### 13 — Auditory-vocal workload at urban hazards

**Tarabay & Abou-Zeid (2018),** *Assessing the effects of auditory-vocal distraction on driving performance and physiological measures using a driving simulator.* Transportation Research Part F, 58, 351–364. DOI: 10.1016/j.trf.2018.06.026.

Eighty students performed delayed digit-recall tasks during pedestrian, truck-braking, and traffic-light events. Workload increased heart rate and skin conductance. Drivers often reduced speed or showed steadier control, which can conceal demand. If a hazard first occurred under load, reaction time was worse; the hardest task accounted for 61% of secondary-task errors.

**Learning:** no crash, stable lane trace, or silence does not prove comprehension; drivers may sacrifice the conversation to protect driving.

### 14 — NHTSA auditory-vocal task evaluation

**Ranney, Baldwin, Skuce, Smith & Mazzae (2019),** *Detection Response Task Evaluation for Driver Distraction Measurement for Auditory-Vocal Tasks: Experiment 2* (DOT HS 812 800).

This NHTSA report tested 192 drivers in stationary and simulator conditions across in-vehicle voice tasks, visual-manual tuning, 1-/2-back workload anchors, and baseline using DRT, eye tracking, heart rate, and braking response.

**Learning:** voice tasks have measurable attentional demand; stationary tests do not consistently rank task difficulty as driving tests do; lower eyes-off-road time does not eliminate cognitive demand. Evaluate policies with hazard response, DRT where possible, glances, recall, task completion/repair, and subjective workload.

### 15 — Naturalistic adult co-driving

**Charlton & Starkey (2020),** *Co-driving: Passenger actions and distractions.* Accident Analysis & Prevention, 144, 105624. DOI: 10.1016/j.aap.2020.105624.

The authors surveyed 592 drivers and observed 22 habitual adult driver-passenger pairs. Drivers valued passengers handling non-driving tasks and navigation; direct critique of driving was least valued. Observed topics included journey-related talk (26.82%), social talk (23.17%), passenger driving support (18.29%), and driver-requested support (15.83%).

**Learning/action:** the best co-driver is practical, timely, invited, and nonjudgmental—not a persistent critic. Prioritize requested route, charging, calls, climate, media, and vehicle support; avoid unsolicited driving commentary unless a defined safety system has appropriate authority.

## Integrated psychology model

| Partner | Possible advantage | Risk | Design lesson |
|---|---|---|---|
| Good passenger | Can share road context and cooperate on timing/help | Still consumes attention; can criticize, distract, or invite glances | Copy context-sensitive practical support, not chatty companionship. |
| Remote caller | Natural conversation | Often lacks road awareness and may continue talking through demand | Do not behave like an unaware remote caller. |
| In-car AI | May use valid route/vehicle context and preserve state | Can be over-trusted, intrusive, verbose, or confidently wrong | Use verified context to reduce demand; clearly state limits and stay interruptible. |

## Working interaction policy

1. **Brief-first, progressive disclosure:** give the decision/action first; offer detail rather than delivering it automatically.
2. **Context-sensitive speech:** near complex junctions, maneuvers, dense traffic, braking, or route changes, prefer a short acknowledgement, one-step answer, or deferred detail. This is a hypothesis to validate—not automatic permission to judge driving.
3. **Repair with minimum driver effort:** preserve known context and ask one focused clarification instead of resetting.
4. **Interruptibility is normal:** “stop,” “short version,” and “continue later” are driver self-regulation, not failures.
5. **Silence is not consent/comprehension:** the driver may have sacrificed the secondary task under load.
6. **Calibrate trust, do not maximize engagement:** warmth must not become persuasion, implied authority, or dependency.
7. **Protect the shared cabin:** clearly control activation, microphone, history, and spoken disclosure.

## Candidate test plan

Evaluate parked, low-demand, and controlled high-demand scenarios; do not use public-road hazards as an informal experiment.

### Scenarios

1. Direct navigation, climate, call, and media requests
2. Ambiguous destinations and correction after a wrong interpretation
3. Short factual questions versus explanation requests
4. Multi-option recommendations and memory-heavy choices
5. “Stop,” “short version,” “later,” and resume behavior
6. Passenger speech, cabin noise, coughing, music, and “yeah” acknowledgements
7. A complex maneuver, braking event, or route change during an unfinished answer
8. Sensitive information and shared-cabin privacy

### Measures

- first-answer usefulness and spoken duration;
- latency to meaningful reply;
- task and recovery success;
- clarification/repeat turns;
- interruption recognition and correct resumption;
- driver recall/comprehension and abandonment;
- glance behavior where relevant;
- subjective workload (for example NASA-TLX);
- DRT/hazard/brake response in an appropriate controlled study;
- perceived trust, calibrated trust, and intrusiveness.

## Risks and remaining research gaps

- No reviewed source establishes a safe maximum LLM answer length in a moving car.
- Low visual demand does not equal low cognitive demand.
- Passenger-context benefits do not make passenger-style conversation safe by default.
- Voice acoustics alone do not justify inferring stress/workload.
- Most studies are simulators, often with young samples; direct validation with diverse drivers and actual vehicle interaction remains needed.
- Still required: spoken-message comprehension/working-memory evidence, naturalistic open-ended LLM conversation while driving, driver/passenger/AI multi-party research, and current product benchmarking.

## Candidate sources not yet archived or used as evidence

- Strayer et al. (2017), *The smartphone and the driver's cognitive workload: A comparison of Apple, Google, and Microsoft's intelligent personal assistants* — abstract/index found; complete authorized PDF still needed.
- Cheng et al. (2021), *How anthropomorphism affects trust in intelligent personal assistants* — abstract found; complete authorized PDF still needed.

These are discovery candidates only. They must not be cited as reviewed evidence until their full text is added to the numbered archive.

## Full-text source archive

The 15 sources below are the complete PDFs used for the research synthesis above. The number matches the paper section in this document.

| # | Full-text PDF | Evidence theme |
|---:|---|---|
| 01 | [Alghamdi et al. — repair strategies](driver-mentality-papers/01_Alghamdi_Repair_Strategies_Spoken_Dialogue.pdf) | Spoken-dialogue repair |
| 02 | [Skantze — turn-taking](driver-mentality-papers/02_Skantze_Turn_Taking_Conversational_Systems.pdf) | Timing and interruption |
| 03 | [Seymour & Van Kleek — trust/anthropomorphism](driver-mentality-papers/03_Seymour_VanKleek_Trust_Anthropomorphism_Relationship.pdf) | Trust calibration |
| 04 | [Pal et al. — trust/intrusiveness](driver-mentality-papers/04_Pal_Trust_Intrusiveness_Voice_Assistants.pdf) | Privacy and competence |
| 05 | [Pyfrom et al. — cognitive load and voice](driver-mentality-papers/05_Pyfrom_Cognitive_Load_Voice_Production.pdf) | Voice-based workload limits |
| 06 | [Chan et al. — LLM voice interaction](driver-mentality-papers/06_Chan_LLM_Voice_Assistant_Interaction.pdf) | LLM conflict and verbosity |
| 07 | [Drews et al. — passenger/phone conversation](driver-mentality-papers/07_Drews_Passenger_Cell_Phone_Conversation.pdf) | Shared context |
| 08 | [Schneider & Kiesler — remote traffic context](driver-mentality-papers/08_Schneider_Kiesler_Remote_Traffic_Context.pdf) | Context-aware timing |
| 09 | [Wood & Hurwitz — conversation suspension](driver-mentality-papers/09_Wood_Hurwitz_Workload_Management.pdf) | High-demand speech deferral |
| 10 | [Tillman et al. — passenger/remote workload](driver-mentality-papers/10_Tillman_Passenger_Remote_Cognitive_Load.pdf) | Hands-free cognitive demand |
| 11 | [Gaspar et al. — road-aware remote partner](driver-mentality-papers/11_Gaspar_Road_Context_Mitigates_Phone_Distraction.pdf) | Situation awareness |
| 12 | [Ishak et al. — passenger conversation/control](driver-mentality-papers/12_Ishak_Passenger_Conversation_Crash_Risks.pdf) | Passenger risk caveat |
| 13 | [Tarabay & Abou-Zeid — auditory-vocal distraction](driver-mentality-papers/13_Tarabay_Auditory_Vocal_Distraction.pdf) | Hazard response and compensation |
| 14 | [NHTSA — auditory-vocal task evaluation](driver-mentality-papers/14_NHTSA_Auditory_Vocal_Tasks.pdf) | Test methodology |
| 15 | [Charlton & Starkey — co-driving](driver-mentality-papers/15_Charlton_Starkey_CoDriving.pdf) | Practical co-driver behavior |
