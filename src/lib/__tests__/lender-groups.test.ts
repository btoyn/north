import { describe, expect, it } from "vitest";
import {
  NO_INSTITUTION,
  NO_TERRITORY,
  describeLastTouch,
  groupLenders,
  type GroupFields,
} from "../lender-groups";

interface Row extends GroupFields {
  name: string;
}

const row = (
  name: string,
  territory: string | null,
  institution: string | null,
  needsAttention = false,
  daysSinceTouch: number | null = 10,
): Row => ({ name, territory, institution, needsAttention, daysSinceTouch });

const read = (r: Row): GroupFields => r;

describe("groupLenders", () => {
  it("keeps one bank's two territories apart", () => {
    const sections = groupLenders(
      [
        row("Kelly", "Southern Utah", "Zions Bank"),
        row("Joe", "Wasatch Front", "Zions Bank"),
        row("Dana", "Southern Utah", "Zions Bank"),
      ],
      read,
    );
    const keys = sections.flatMap((s) => s.groups.map((g) => g.key));
    expect(keys).toContain("Southern Utah::Zions Bank");
    expect(keys).toContain("Wasatch Front::Zions Bank");
    const south = sections.find((s) => s.territory === "Southern Utah")!;
    expect(south.groups[0].members.map((m) => m.name)).toEqual(["Kelly", "Dana"]);
  });

  it("counts who needs attention per group and per territory", () => {
    const sections = groupLenders(
      [
        row("A", "Southern Utah", "State Bank", true),
        row("B", "Southern Utah", "State Bank", true),
        row("C", "Southern Utah", "State Bank", false),
        row("D", "Southern Utah", "Cache Valley", true),
      ],
      read,
    );
    const south = sections[0];
    expect(south.total).toBe(4);
    expect(south.needingAttention).toBe(3);
    const state = south.groups.find((g) => g.institution === "State Bank")!;
    expect(state.needingAttention).toBe(2);
    expect(state.members).toHaveLength(3);
  });

  it("puts the group with the most slipping people first", () => {
    const sections = groupLenders(
      [
        row("A", "Wasatch Front", "Healthy Bank", false),
        row("B", "Wasatch Front", "Healthy Bank", false),
        row("C", "Wasatch Front", "Healthy Bank", false),
        row("D", "Wasatch Front", "Slipping Bank", true),
      ],
      read,
    );
    expect(sections[0].groups.map((g) => g.institution)).toEqual([
      "Slipping Bank",
      "Healthy Bank",
    ]);
  });

  it("breaks an attention tie by size, then by name", () => {
    const sections = groupLenders(
      [
        row("A", "Wasatch Front", "Big Bank"),
        row("B", "Wasatch Front", "Big Bank"),
        row("C", "Wasatch Front", "Alpha Bank"),
        row("D", "Wasatch Front", "Beta Bank"),
      ],
      read,
    );
    expect(sections[0].groups.map((g) => g.institution)).toEqual([
      "Big Bank",
      "Alpha Bank",
      "Beta Bank",
    ]);
  });

  it("orders territories by how many partners they hold", () => {
    const sections = groupLenders(
      [
        row("A", "Southern Utah", "X"),
        row("B", "Wasatch Front", "Y"),
        row("C", "Wasatch Front", "Y"),
      ],
      read,
    );
    expect(sections.map((s) => s.territory)).toEqual(["Wasatch Front", "Southern Utah"]);
  });

  it("reports the freshest touch in the group, not the stalest", () => {
    const sections = groupLenders(
      [
        row("A", "Southern Utah", "X", false, 40),
        row("B", "Southern Utah", "X", false, 3),
        row("C", "Southern Utah", "X", false, 22),
      ],
      read,
    );
    expect(sections[0].groups[0].lastTouchDays).toBe(3);
  });

  it("ignores never-contacted people when reporting the group's last touch", () => {
    const sections = groupLenders(
      [
        row("A", "Southern Utah", "X", true, null),
        row("B", "Southern Utah", "X", false, 12),
      ],
      read,
    );
    expect(sections[0].groups[0].lastTouchDays).toBe(12);
  });

  it("leaves the last touch null when nobody has been contacted", () => {
    const sections = groupLenders([row("A", "Southern Utah", "X", true, null)], read);
    expect(sections[0].groups[0].lastTouchDays).toBeNull();
  });

  it("labels missing institution and territory rather than dropping the partner", () => {
    const sections = groupLenders([row("A", null, null)], read);
    expect(sections[0].territory).toBe(NO_TERRITORY);
    expect(sections[0].groups[0].institution).toBe(NO_INSTITUTION);
  });

  it("treats blank strings as missing", () => {
    const sections = groupLenders([row("A", "   ", "  ")], read);
    expect(sections[0].territory).toBe(NO_TERRITORY);
    expect(sections[0].groups[0].institution).toBe(NO_INSTITUTION);
  });

  it("sorts unplaced partners last even when there are many of them", () => {
    const sections = groupLenders(
      [
        row("A", null, "X"),
        row("B", null, "X"),
        row("C", null, "X"),
        row("D", "Southern Utah", "Y"),
      ],
      read,
    );
    expect(sections.map((s) => s.territory)).toEqual(["Southern Utah", NO_TERRITORY]);
  });

  it("loses nobody", () => {
    const rows = [
      row("A", "Southern Utah", "X"),
      row("B", "Wasatch Front", "X"),
      row("C", null, null),
      row("D", "Southern Utah", "Y"),
    ];
    const sections = groupLenders(rows, read);
    const total = sections.reduce((n, s) => n + s.total, 0);
    expect(total).toBe(rows.length);
  });

  it("returns nothing for an empty list", () => {
    expect(groupLenders([], read)).toEqual([]);
  });
});

describe("describeLastTouch", () => {
  it("reads naturally at the near end", () => {
    expect(describeLastTouch(0)).toBe("touched today");
    expect(describeLastTouch(1)).toBe("touched yesterday");
    expect(describeLastTouch(9)).toBe("last touch 9d ago");
  });

  it("says so plainly when there is no touch at all", () => {
    expect(describeLastTouch(null)).toBe("never contacted");
  });
});
