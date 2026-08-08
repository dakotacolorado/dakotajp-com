/**
 * The signing itself is AWS's; what is worth testing is the gate in front of it
 * -- an upload URL is a write capability, so anything it refuses to sign is a
 * write that cannot happen.
 */
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://s3.example/signed"),
}));

process.env.MEDIA_BUCKET_NAME = "test-media-bucket";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_UPLOAD_BYTES } from "@dakotajp/core";
import { createUploadTarget } from "./media";

describe("createUploadTarget", () => {
  it("signs a PUT and returns the URL the image will be served from", async () => {
    const { uploadUrl, publicUrl } = await createUploadTarget("image/webp", 1024);

    expect(uploadUrl).toBe("https://s3.example/signed");
    // The key is the path: `/media/*` passes through to the bucket untouched.
    expect(publicUrl).toMatch(/^\/media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
  });

  it("gives each upload its own key", async () => {
    const a = await createUploadTarget("image/png", 10);
    const b = await createUploadTarget("image/png", 10);
    expect(a.publicUrl).not.toBe(b.publicUrl);
  });

  it("signs the exact length, so the URL cannot be reused for other bytes", async () => {
    await createUploadTarget("image/jpeg", 4242);

    const command = (getSignedUrl as jest.Mock).mock.calls.at(-1)?.[1];
    expect(command.input).toMatchObject({
      Bucket: "test-media-bucket",
      ContentType: "image/jpeg",
      ContentLength: 4242,
    });
  });

  it("refuses a type that is not an allowed image", async () => {
    await expect(createUploadTarget("text/html", 10)).rejects.toThrow(
      /Unsupported image type/,
    );
    await expect(
      createUploadTarget("application/octet-stream", 10),
    ).rejects.toThrow(/Unsupported image type/);
  });

  it("refuses a file over the size ceiling", async () => {
    await expect(
      createUploadTarget("image/png", MAX_UPLOAD_BYTES + 1),
    ).rejects.toThrow(/larger than/);
  });

  it("refuses a nonsense size", async () => {
    await expect(createUploadTarget("image/png", 0)).rejects.toThrow(
      /Invalid file size/,
    );
    await expect(createUploadTarget("image/png", -1)).rejects.toThrow(
      /Invalid file size/,
    );
    await expect(createUploadTarget("image/png", NaN)).rejects.toThrow(
      /Invalid file size/,
    );
  });
});
