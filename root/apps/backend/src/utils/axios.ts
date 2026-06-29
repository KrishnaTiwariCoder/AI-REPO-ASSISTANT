import axios from "axios"

const api = axios.create({
    baseURL: process.env.GITHUB_API_BASE_URL || "https://api.github.com",
    headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            const { status, statusText, data } = error.response
            const message = data?.message || statusText || "Unknown error"
            const wrapped = new Error(`GitHub API error: ${status} ${message}`)
            ;(wrapped as any).status = status   
            return Promise.reject(wrapped)
        }
        return Promise.reject(error)
    }
)

export default api