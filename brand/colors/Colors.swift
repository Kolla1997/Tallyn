import SwiftUI

extension Color {
    static let tallynClay = Color(hex: "#C8553D")
    static let tallynSage = Color(hex: "#6F9575")
    static let tallynClayDeep = Color(hex: "#B04A34")
    static let tallynSageDeep = Color(hex: "#4F7355")
    static let tallynSageLight = Color(hex: "#A9C5AC")
    static let tallynCocoa = Color(hex: "#3B2F2F")
    static let tallynCream = Color(hex: "#F6F1E9")
    static let tallynSand = Color(hex: "#ECE5D6")
    static let tallynWhite = Color(hex: "#FFFFFF")
    static let tallynTextSecondary = Color(hex: "#6B5F5C")
    static let tallynBorder = Color(hex: "#DDD3C3")
    static let tallynSuccess = Color(hex: "#267A4C")
    static let tallynWarning = Color(hex: "#D9962B")
    static let tallynError = Color(hex: "#B93A32")
}

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0; Scanner(string: s).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 255)/255, green: Double((v >> 8) & 255)/255, blue: Double(v & 255)/255)
    }
}
