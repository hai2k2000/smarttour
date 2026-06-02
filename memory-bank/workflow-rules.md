# Workflow Rules

- After each completed code or configuration change, verify the change, commit it to Git, and push it to `origin` before considering the task finished.
- Do not use `git add .` when unrelated changes are present. Stage only the files that belong to the completed change.
- If the worktree already contains unrelated dirty files, keep the new change in a focused commit and leave unrelated files untouched.
- Report the commit hash and push status to the user after deployment.
