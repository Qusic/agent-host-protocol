---
name: update-protocol
description: Update protocol with changes from the vscode repo
---

Relative to this workspace, the actual implementation of this protocol lives in `../vscode/src/vs/platform/agentHost`. Please:

- Review changes to the protocol as defined in that repo (you can look at git history in that folder to find recent changes).
- Analyze and reflect on how the protocol has evolved since the last set of changes to this repo. The file LAST_SYNCED_COMMIT in this repo contains the last time this prompt was run.
- If there are ambiguities, you may use the #tool:vscode/askQuestions tool to ask for clarification.
- Update this documentation to reflect the current state of the protocol, ensuring it accurately describes the message types, lifecycle, and any other relevant details.

Once you have done this, THEN:

- Create a #tool:agent/runSubagent to review the changes you have made for readability and clarity, and consistency with the implementation.
- Consider and implement its suggestions as appropriate.

Finally, update LAST_SYNCED_COMMIT with the latest commit hash from the vscode repo that you synced to.
