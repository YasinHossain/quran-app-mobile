import AppKit
import CoreText

// Run on macOS: swift scripts/generate-mushaf-previews.swift "$PWD"
// Samples use existing bundled Quran fonts and the excerpt from 3:3 used by the original cards.
let root = CommandLine.arguments[1]
let samples = [
  ("uthmani", "UthmanicHafs1Ver18.ttf", "نَزَّلَ عَلَيْكَ ٱلْكِتَـٰبَ بِٱلْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ"),
  ("indopak", "indopak-nastaleeq-waqf-lazim-v4.2.1.ttf", "نَزَّلَ عَلَيۡكَ الۡكِتٰبَ بِالۡحَقِّ مُصَدِّقًا لِّمَا بَيۡنَ يَدَيۡهِ")
]
for (name, file, text) in samples {
  let url = URL(fileURLWithPath: root + "/assets/fonts/" + file)
  let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as! [CTFontDescriptor]
  let font = CTFontCreateWithFontDescriptor(descriptors[0], 58, nil)
  let string = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1)
  ])
  let line = CTLineCreateWithAttributedString(string)
  let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
  let width = 1000, height = 160
  let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let scale = min(1, 940 / bounds.width)
  context.translateBy(x: (CGFloat(width) - bounds.width * scale) / 2 - bounds.minX * scale, y: (CGFloat(height) - bounds.height * scale) / 2 - bounds.minY * scale)
  context.scaleBy(x: scale, y: scale)
  CTLineDraw(line, context)
  let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
  try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: root + "/assets/images/mushaf-previews/" + name + ".png"))
}
