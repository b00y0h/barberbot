import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

describe("Environment Configuration", () => {
  describe("Legacy provider validation", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear legacy vars before each test
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPGRAM_API_KEY;
      delete process.env.ELEVENLABS_API_KEY;
    });

    afterEach(() => {
      // Restore original env
      process.env = { ...originalEnv };
    });

    it("validateNoLegacyProviders returns empty array when no legacy vars set", async () => {
      // Dynamic import to get fresh module
      const { validateNoLegacyProviders } = await import("./env");
      const errors = validateNoLegacyProviders();
      assert.deepStrictEqual(errors, []);
    });

    it("validateNoLegacyProviders returns error for OPENAI_API_KEY", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      // Need to re-import to pick up env changes
      const envModule = await import("./env");
      const errors = envModule.validateNoLegacyProviders();
      assert.ok(errors.some((e) => e.includes("OPENAI_API_KEY")));
    });

    it("validateNoLegacyProviders returns error for DEEPGRAM_API_KEY", async () => {
      process.env.DEEPGRAM_API_KEY = "test-key";
      const envModule = await import("./env");
      const errors = envModule.validateNoLegacyProviders();
      assert.ok(errors.some((e) => e.includes("DEEPGRAM_API_KEY")));
    });

    it("validateNoLegacyProviders returns error for ELEVENLABS_API_KEY", async () => {
      process.env.ELEVENLABS_API_KEY = "test-key";
      const envModule = await import("./env");
      const errors = envModule.validateNoLegacyProviders();
      assert.ok(errors.some((e) => e.includes("ELEVENLABS_API_KEY")));
    });

    it("returns multiple errors when multiple legacy vars set", async () => {
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.DEEPGRAM_API_KEY = "test-key";
      const envModule = await import("./env");
      const errors = envModule.validateNoLegacyProviders();
      assert.strictEqual(errors.length, 2);
    });
  });

  describe("AWS configuration", () => {
    it("env.aws has required properties", async () => {
      const { env } = await import("./env");

      assert.ok("accessKeyId" in env.aws);
      assert.ok("secretAccessKey" in env.aws);
      assert.ok("region" in env.aws);
    });

    it("AWS region defaults to us-east-2", async () => {
      const originalRegion = process.env.AWS_REGION;
      delete process.env.AWS_REGION;

      // Clear module cache and re-import
      const envPath = require.resolve("./env");
      delete require.cache[envPath];

      const { env } = await import("./env");
      assert.strictEqual(env.aws.region, "us-east-2");

      // Restore
      if (originalRegion) process.env.AWS_REGION = originalRegion;
    });
  });
});
