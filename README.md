# usage-rings

A Claude Code mod that shows every usage limit as a progress ring in the band just above the prompt.

- One ring per limit the engine reports, typically the 5-hour window and the weekly window, plus a spend limit where you have one.
- Each ring shows the percent used and when the window resets. The ring is green, turns amber from 70% and red from 90%.
- In the desktop app and editor the rings are drawn as SVG. In a terminal, which has no vector element, they fall back to text glyphs (○ ◔ ◑ ◕ ●).
- A new session shows the last readings any session saw straight away, dimmed and marked "last seen", then switches to live figures as soon as the engine reports them. Before your very first message ever, there is nothing to show yet.
- The band stays out of the way while a survey is up.

The mod reads only the usage figures the engine gives it and stores the last readings in its own key-value store on your machine. It makes no network requests.

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
