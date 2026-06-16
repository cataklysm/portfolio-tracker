import { expect, test, type Page } from "@playwright/test"

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "dev@example.com"
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "qwerty"

test.describe("admin navigation", () => {
  test("admin can open symbols, providers, and exchanges", async ({ page }) => {
    const errors = collectRuntimeErrors(page)

    await page.goto("/login")
    await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible()

    await page.locator("#email").fill(adminEmail)
    await page.locator("#password").fill(adminPassword)
    await page.getByRole("button", { name: "Sign in" }).click()

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByRole("link", { name: "Administration" })).toBeVisible()

    await page.getByRole("link", { name: "Symbols" }).click()
    await expect(page).toHaveURL(/\/administration\/symbols/)
    await expect(page.getByRole("heading", { name: "Symbols" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Add symbol" })).toBeVisible()

    await page.getByRole("link", { name: "Providers" }).click()
    await expect(page).toHaveURL(/\/administration\/providers/)
    await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible()
    await expect(page.getByPlaceholder("Search provider, class, quality or capability")).toBeVisible()
    await expect(page.locator("article").first()).toBeVisible()

    const firstProvider = page.locator("article").first()
    const firstProviderName = (await firstProvider.getByRole("heading").textContent())?.trim()
    expect(firstProviderName).toBeTruthy()

    await page.getByPlaceholder("Search provider, class, quality or capability").fill(firstProviderName!)
    await expect(page.locator("article")).toHaveCount(1)
    await page.getByPlaceholder("Search provider, class, quality or capability").fill("not-a-real-provider")
    await expect(page.getByText("No providers match this view.")).toBeVisible()
    await page.getByPlaceholder("Search provider, class, quality or capability").fill("")

    await expect(firstProvider.getByRole("switch")).toBeVisible()

    await firstProvider.locator("button[aria-expanded]").click()
    await expect(firstProvider.locator("button[aria-expanded]")).toHaveAttribute("aria-expanded", "false")
    await page.reload()
    await expect(page.locator("article").first().locator("button[aria-expanded]")).toHaveAttribute("aria-expanded", "false")

    await page.getByRole("link", { name: "Exchanges" }).click()
    await expect(page).toHaveURL(/\/administration\/exchanges/)
    await expect(page.getByRole("heading", { name: "Exchange calendar" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Exchanges" })).toBeVisible()

    expect(errors, errors.join("\n")).toEqual([])
  })
})

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`)
  })
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`)
  })
  return errors
}
