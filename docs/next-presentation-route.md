# Next.js Presentation Route

This example shows a relying party verifying Mintra presentations inside a Next.js route handler.

```ts
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import { verifyPresentation } from "@mintra/verifier-core";
import type { PresentationEnvelope } from "@mintra/sdk-types";

const nodeRequire = createRequire(import.meta.url);
const MinaSigner = nodeRequire("mina-signer");
const signers = [
  new MinaSigner({ network: "mainnet" }),
  new MinaSigner({ network: "testnet" }),
];

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    presentationEnvelope: PresentationEnvelope;
    expectedOwnerPublicKey?: string;
  };

  const origin = request.headers.get("origin") ?? "https://example.com";
  const result = await verifyPresentation({
    envelope: body.presentationEnvelope,
    verifierIdentity: origin,
    expectedAudience: origin,
    holderBindingVerifier: {
      verifyMessage(input) {
        return signers.some((signer) =>
          signer.verifyMessage({
            publicKey: input.publicKey,
            data: input.data,
            signature: input.signature,
          })
        );
      },
    },
    ...(body.expectedOwnerPublicKey === undefined
      ? {}
      : { expectedOwnerPublicKey: body.expectedOwnerPublicKey }),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 403 });
}
```

Related docs:

- [How To Consume Proofs](./consume-proofs.md)
- [Verifier Integration](./verifier-integration.md)
