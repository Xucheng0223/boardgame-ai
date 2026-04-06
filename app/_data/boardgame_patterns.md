# Board Game Mechanical Patterns Reference

Derived from "Building Blocks of Tabletop Game Design."
Use this file as a checklist when scanning a rulebook txt. Identify which patterns are present, then verify every expected chunk exists in the JSON.

---

## Step 1 — Identify Game Structure

Determines what sections MUST exist in the rulebook.

| Structure Type | What it implies for the rulebook |
|---|---|
| **Competitive** | Individual scoring, turn order rules, tiebreaker |
| **Cooperative** | Shared win/loss condition, AI opponent or threat system |
| **Solo** | AI opponent rules OR goal/record system; solo setup differences |
| **Semi-Cooperative** | Group win condition + individual winner rule |
| **Traitor / Hidden Role** | Hidden information rules, reveal conditions |
| **Campaign / Legacy** | Scenario structure, persistent state between sessions |
| **Score-and-Reset** | Multiple rounds/hands, round-end scoring |
| **Team-Based** | Team formation, shared resources or actions |

---

## Step 2 — Turn Structure Checklist

Every game has a turn structure. Find and chunk ALL of these that apply.

- **Who goes first** — starting player rule, first-game rule
- **Turn order** — fixed clockwise, stat-based, bid-based, time-track, etc.
- **What a player does on their turn** — the core turn loop
- **Pass rules** — when/how a player can pass, what passing does
- **End of turn** — any mandatory cleanup or trigger at turn end
- **Round structure** — if turns are grouped into rounds, what happens between rounds
- **Interrupts** — can other players react mid-turn?
- **Simultaneous actions** — do players act at the same time?

---

## Step 3 — Action Identification Checklist

For every action a player can take, there must be a chunk. Common action categories:

### Action Selection Mechanics
- **Action Points** — player has N points, spends them on actions
- **Action Drafting** — choose from a shared set of available actions
- **Rondel** — circular wheel, position determines available actions
- **Worker Placement** — place a worker token to claim an action space
- **Card Play** — play a card to trigger its action
- **Role Selection** — choose a role that defines your actions this round
- **Tech Trees / Tracks** — unlock actions by advancing on a track

### For Worker Placement games specifically, look for:
- Placement rules (who can place where, blocking rules)
- Worker types (are all workers equal or specialized?)
- Recovering workers (when and how workers return to the player)
- Unlocking new workers (how to expand your worker pool)
- Resolution order (when do placed workers' actions resolve?)

### Action Execution Patterns
- **Main actions vs. additional/optional actions** — are some actions always available? Are some free?
- **Action limits** — how many actions per turn?
- **Once-per-game abilities** — special single-use powers
- **Gating / prerequisites** — must you do X before Y?
- **Follow mechanic** — can other players copy your action?

---

## Step 4 — Resolution Checklist

How outcomes are determined. Find chunks for every method used.

- **Dice** — what dice, what symbols, how results are read, reroll rules, locking dice
- **Cards** — card play resolution, card hierarchy, trick-taking if present
- **Stats / comparison** — direct stat comparison between units or players
- **Push-your-luck** — risk/reward escalation rules
- **Physical action** — dexterity, flicking, balancing (rare but note if present)
- **Voting / consensus** — group decision resolution
- **Tiebreakers** — explicit rules for ties in resolution AND in scoring

---

## Step 5 — Economy / Resource Checklist

Trace the full resource loop. Every step needs a chunk.

- **Resource types** — what resources exist, are they basic or special?
- **Resource acquisition** — how players gain resources (production, income, actions)
- **Resource costs** — what resources are spent on and when
- **Resource conversion / exchange** — can resources be traded or converted?
- **Resource limits** — hand limits, storage limits, caps
- **Income / automatic growth** — resources gained passively each round
- **Market / pricing** — variable cost systems
- **Trading between players** — negotiation, direct trade rules
- **Upgrades** — spending resources to permanently improve something
- **Loans / debt** — borrowing mechanics if present

---

## Step 6 — Scoring / Victory Condition Checklist

Every scoring type needs its own chunk or clear coverage.

- **Immediate VP** — points scored as actions are taken
- **Endgame VP** — points scored only at game end
- **Temporary VP** — points that can be lost (e.g., deviation tokens)
- **VP as a resource** — spending points to take actions
- **Hidden vs. exposed VP** — secret scoring vs. public scoring
- **End-game bonuses / multipliers** — bonus points for completing sets, majorities, etc.
- **Game end triggers** — what causes the game to end (exhausted deck, last tile placed, X rounds, track reached end, etc.)
- **End-game procedure** — do you complete the round? Does the player who triggered the end still play?
- **Tiebreaker rule** — explicit tiebreaker for final scores
- **Win conditions (non-VP)** — race goals, connection goals, elimination

---

## Step 7 — Uncertainty / Information Checklist

- **Hidden information** — what is face-down or secret, and from whom?
- **Random elements** — shuffled decks, dice rolls, random draws
- **Variable setup** — what changes each game (random board, random objectives, etc.)
- **Push-your-luck** — explicit risk escalation mechanics
- **Memory** — are players expected to remember hidden information?
- **Probability management** — can players manipulate odds (bag-building, deck thinning)?
- **Hidden roles** — if present: reveal conditions, win conditions per role

---

## Step 8 — Spatial / Movement Checklist (if applicable)

- **Board layout** — grid, hex, point-to-point, free placement?
- **Movement rules** — how pieces move, movement cost, adjacency definition
- **Area control** — how control is determined (majority, absolute, influence)
- **Blocking / zone of control** — can pieces restrict others?
- **Map changes** — does the board grow, shrink, or deform during play?
- **Adjacency definition** — orthogonal only? Diagonal included? Edge vs. corner?

---

## Step 9 — Card-Specific Checklist (if applicable)

- **Deck composition** — what cards exist, in what quantities
- **Hand management** — hand size limits, drawing rules, discard rules
- **Deck building** — if players construct their decks during play
- **Drafting** — if players select cards from a shared pool
- **Multi-use cards** — cards that can be used in multiple ways (play for action OR for resource)
- **Tags / card types** — classification systems that other rules reference

---

## Step 10 — Appendix / Reference Checklist

Appendices are the most commonly missed content. Every appendix entry needs coverage.

- **Iconography guide** — what each icon/symbol means
- **Card effects reference** — every unique card effect listed
- **Tile effects reference** — every unique tile/token effect
- **Scoring tables** — exact VP values per condition
- **Special component rules** — unique boards, wheels, dials, tracks
- **Player aid summary** — turn order summary, action summary
- **Solo AI rules** — all AI opponent behaviors, scoring, difficulty levels

---

## Pattern → Expected Chunks Mapping

Use this when you've identified a pattern to know what chunks to produce:

| Pattern identified | Chunks you need |
|---|---|
| Worker placement | Setup (worker positions), Placing workers, Recovering workers, Unlocking workers, Blocking rules |
| Resource management | Resource types, Gaining resources, Spending resources, Exchange/conversion, Resource limits |
| Track advancement | Track description, How to advance, Bonuses per level, Max level effect |
| Scoring track | Immediate VP rules, Endgame VP rules, Scoring triggers, Tiebreaker |
| Cooperative + AI | AI turn structure, AI decision rules, AI difficulty/scaling, Win/loss conditions |
| Area control | Control definition, Adjacency rules, Majority rules, Scoring for control |
| Deck/hand | Draw rules, Hand limit, Discard rules, Deck exhaustion |
| Hidden info | What is hidden, When it is revealed, How it affects rules |
| Round structure | Round phases, End-of-round procedure, Round counter/trigger |
| Special actions | Each action gets its own chunk with cost, effect, and any limits |

---

## Red Flags — Common Missing Content

If any of these are absent from your chunk list, investigate:

- No tiebreaker rule → check end-of-game section
- No game end trigger → check rules carefully, may be spread across sections
- No recovery/reset rule for a consumable resource → look in appendix or turn structure
- No "what happens if you can't do X" rule → often implicit, may need its own chunk
- Appendix sections with icons not explained in main rules → each needs a chunk
- Solo mode mentioned but only partially covered → solo often has unique setup AND unique rules
- "See appendix" references in main rules → always follow these and create chunks for what you find
