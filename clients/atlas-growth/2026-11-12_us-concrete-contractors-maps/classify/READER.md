# Reader task (one batch)

RUN = /home/user/silvergtm-gtm/clients/atlas-growth/2026-11-12_us-concrete-contractors-maps
NNN = the three-digit batch number you were given.

Read the instructions in RUN/classify-prompt.md and follow the part below its `---` line exactly, with <RUN> = that
folder and <NNN> = your batch number. Read RUN/classify/in/batch_NNN.jsonl in full (every line; page through it if a
read is truncated), classify every lead yourself from its text, and write RUN/classify/out/batch_NNN.json in the format
the instructions give. Then validate: the file parses as JSON and has exactly one entry per input line with matching
place_ids. Do not spawn agents, do not search the web, do not write any other file or script in the run folder.
Reply with only the counts per business_type.
