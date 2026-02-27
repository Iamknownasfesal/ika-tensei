import React from "react";
import { Composition } from "remotion";
import { PromoTrailer } from "./PromoTrailer";
import { ProductDemo } from "./ProductDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="promo-trailer"
        component={PromoTrailer}
        durationInFrames={1342}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="product-demo"
        component={ProductDemo}
        durationInFrames={2034}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
