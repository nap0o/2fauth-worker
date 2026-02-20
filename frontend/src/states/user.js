import { reactive } from 'vue'

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}')
  } catch (e) {
    return {}
  }
}

export const userState = reactive({
  userInfo: getStoredUser(),

  setUserInfo(info) {
    this.userInfo = info
    localStorage.setItem('userInfo', JSON.stringify(info))
  },

  clearUserInfo() {
    this.userInfo = {}
    localStorage.removeItem('userInfo')
    localStorage.removeItem('authToken')
  }
})