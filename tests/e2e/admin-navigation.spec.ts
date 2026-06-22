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
    await expect(page.getByLabel("breadcrumb")).toContainText("Administration")
    await expect(page.getByLabel("breadcrumb")).toContainText("Symbols")
    await expect(page.getByRole("button", { name: "Add symbol" })).toBeVisible()

    await page.getByRole("link", { name: "Providers" }).click()
    await expect(page).toHaveURL(/\/administration\/providers/)
    await expect(page.getByLabel("breadcrumb")).toContainText("Administration")
    await expect(page.getByLabel("breadcrumb")).toContainText("Providers")
    const providerSearch = page.getByRole("textbox", { name: "Search", exact: true })
    await expect(providerSearch).toBeVisible()
    await expect(page.getByTestId("provider-card").first()).toBeVisible()

    const firstProvider = page.getByTestId("provider-card").first()
    const firstProviderName = (await firstProvider.getByRole("heading").textContent())?.trim()
    expect(firstProviderName).toBeTruthy()

    await providerSearch.fill(firstProviderName!)
    await expect(page.getByTestId("provider-card")).toHaveCount(1)
    await providerSearch.fill("not-a-real-provider")
    await expect(page.getByText("No providers match this view.")).toBeVisible()
    await providerSearch.fill("")

    await expect(firstProvider.getByRole("switch", { name: /availability/i })).toBeVisible()

    await firstProvider.getByRole("heading").click()
    await expect(firstProvider.getByRole("button", { name: "Save changes" })).toBeHidden()
    await page.reload()
    await expect(page.getByTestId("provider-card").first().getByRole("button", { name: "Save changes" })).toBeHidden()

    await page.getByRole("link", { name: "Exchanges" }).click()
    await expect(page).toHaveURL(/\/administration\/exchanges/)
    await expect(page.getByLabel("breadcrumb")).toContainText("Administration")
    await expect(page.getByLabel("breadcrumb")).toContainText("Exchanges")
    await expect(page.getByRole("textbox", { name: "Search", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible()

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
