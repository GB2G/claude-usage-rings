# usage-rings

A Claude Code mod that shows every usage limit as a progress ring in the band just above the prompt.

- One ring per limit the engine reports, typically the 5-hour window and the weekly window, plus a spend limit where you have one.
- Each ring shows the percent used and when the window resets. The ring is green, turns amber from 70% and red from 90%.
- In the desktop app and editor the rings are drawn as SVG. In a terminal, which has no vector element, they fall back to text glyphs (○ ◔ ◑ ◕ ●).
- A new session shows the last readings any session saw straight away, dimmed and marked "last seen", then switches to live figures as soon as the engine reports them. Before your very first message ever, there is nothing to show yet.
- Beside the rings, a task progress bar with an estimated wait time. While a prompt runs it shows `Task 2/5`, a bar and `~1m 20s left`. With a task list the estimate is the average time per finished step times the steps left. Without one it compares elapsed time to the median of your last 20 turns and stops at 95% until the turn ends. It only ever estimates: Claude cannot know how long a task will really take.
- When nothing is running the bar stays visible and empty, showing how long the last task took.
- The band stays out of the way while a survey is up.

The mod reads only the usage figures the engine gives it and stores the last readings and your last 20 turn lengths in its own key-value store on your machine. It makes no network requests.

## Install

At the prompt of a terminal session:

```
/plugin install usage-rings --marketplace GB2G/claude-usage-rings
```

From a shell:

```
claude plugin install usage-rings --marketplace GB2G/claude-usage-rings
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `GB2G/claude-usage-rings`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## License

MIT, see [LICENSE](LICENSE). Provided as is, with no warranty.
