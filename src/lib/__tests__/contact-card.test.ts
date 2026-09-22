import { describe, expect, it } from "vitest";
import {
  contactCardFields,
  formatAddress,
  formatPhone,
  telHref,
  type ContactCardInput,
} from "../contact-card";

const bank = {
  id: "inst-1",
  name: "Wasatch Valley Bank",
  address: "1 Main St",
  city: "Salt Lake City",
  state: "UT",
  mainPhone: "801-555-0100",
};

const input = (over: Partial<ContactCardInput["lender"]> = {}, institution = bank) =>
  contactCardFields({
    lender: {
      address: null,
      city: null,
      state: null,
      email: "jake@wasatch.example",
      mobilePhone: "8015550142",
      officePhone: null,
      ...over,
    },
    institution,
  });

describe("formatAddress", () => {
  it("writes it the way an envelope reads", () => {
    expect(formatAddress({ address: "1 Main St", city: "Ogden", state: "UT" })).toBe(
      "1 Main St, Ogden, UT",
    );
  });

  it("keeps a city with no street, which is most of the use", () => {
    expect(formatAddress({ address: null, city: "St. George", state: "UT" })).toBe("St. George, UT");
  });

  it("is null when there is nothing", () => {
    expect(formatAddress({ address: null, city: null, state: null })).toBeNull();
    expect(formatAddress({ address: "  ", city: "", state: null })).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats ten digits however they were typed", () => {
    for (const raw of ["8015550142", "801 555 0142", "(801) 555-0142", "801.555.0142"]) {
      expect(formatPhone(raw)).toBe("(801) 555-0142");
    }
  });

  it("drops a leading country code", () => {
    expect(formatPhone("1-801-555-0142")).toBe("(801) 555-0142");
  });

  it("leaves anything it doesn't recognise exactly as typed", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("ext 4412")).toBe("ext 4412");
  });

  it("is null for nothing", () => {
    expect(formatPhone(null)).toBeNull();
    expect(formatPhone("   ")).toBeNull();
  });
});

describe("telHref", () => {
  it("dials a US number", () => {
    expect(telHref("(801) 555-0142")).toBe("tel:+18015550142");
    expect(telHref("1-801-555-0142")).toBe("tel:+18015550142");
  });

  it("hands over anything else without inventing a country", () => {
    expect(telHref("+44 20 7946 0958")).toBe("tel:442079460958");
  });

  it("refuses something too short to be a number", () => {
    expect(telHref("4412")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe("contactCardFields", () => {
  it("prefers their own address over the bank's", () => {
    const fields = input({ address: "88 Branch Rd", city: "Sandy", state: "UT" });
    expect(fields.address).toEqual({ text: "88 Branch Rd, Sandy, UT", source: "lender" });
  });

  it("falls back to the bank when they have no address of their own", () => {
    expect(input().address).toEqual({
      text: "1 Main St, Salt Lake City, UT",
      source: "bank",
    });
  });

  it("hides the switchboard when there is a direct number", () => {
    expect(input().switchboard).toBeNull();
  });

  it("offers the switchboard when there is no direct number at all", () => {
    expect(input({ mobilePhone: null, officePhone: null }).switchboard).toBe("(801) 555-0100");
  });

  it("formats both direct numbers", () => {
    const fields = input({ mobilePhone: "8015550142", officePhone: "801-555-0199" });
    expect(fields.cell).toBe("(801) 555-0142");
    expect(fields.office).toBe("(801) 555-0199");
  });

  it("carries the bounce through so the card can warn", () => {
    expect(input({ emailBounced: true }).emailBounced).toBe(true);
    expect(input().emailBounced).toBe(false);
  });

  it("knows when it has nothing worth showing", () => {
    const fields = contactCardFields({
      lender: {
        address: null,
        city: null,
        state: null,
        email: null,
        mobilePhone: null,
        officePhone: null,
      },
      institution: null,
    });
    expect(fields.empty).toBe(true);
  });

  it("is not empty when only the bank is known", () => {
    const fields = input({ email: null, mobilePhone: null });
    expect(fields.empty).toBe(false);
    expect(fields.bank).toEqual({ id: "inst-1", name: "Wasatch Valley Bank" });
  });
});
