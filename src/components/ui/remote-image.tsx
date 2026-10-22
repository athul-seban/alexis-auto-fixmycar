import Image from "next/image"
import { canOptimise } from "@/lib/image-hosts"

interface RemoteImageProps {
  src: string
  alt: string
  /** Intrinsic size to request: roughly the largest size it is shown at (CSS still decides the displayed size). */
  width: number
  height: number
  className?: string
  /** Tells the browser how wide the image is laid out, so it picks the smallest file that is sharp enough. */
  sizes?: string
  /** The main image of the page (above the fold): load it first. */
  priority?: boolean
}

/**
 * An image from a garage or a business: resized and compressed by next/image when it lives on a host we've allowed
 * (src/lib/image-hosts.ts), and a plain lazy <img> otherwise, because next/image throws for a host that isn't configured and
 * a stored URL isn't always one of ours. Either way the markup is an <img> with the same class, so layout doesn't change.
 */
export function RemoteImage({ src, alt, width, height, className, sizes, priority }: RemoteImageProps) {
  if (canOptimise(src)) {
    return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} className={className} priority={priority} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={className} loading={priority ? "eager" : "lazy"} decoding="async" />
}
