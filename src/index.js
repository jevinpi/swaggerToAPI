/**
 * 创建axios的实例，增加拦截器
 */
import axios, { AxiosResponse } from 'axios';
import codeMessages from './codeMessages';

const instance = axios.create({
    timeout: 10000,
});

instance.defaults.headers.post['Content-Type'] = 'application/json';

/**
 * request拦截器
 */
instance.interceptors.request.use(
    config => {
        config.headers.Authorization = 'Bearer';
        return config;
    },
    (error: any) => {
        Promise.reject(error);
    }
);
/**
 * response拦截器
 */
instance.interceptors.response.use(
    response => {
        const data = response.data;
        if (data.code && data.code !== 200) {
            console.error(data.msg);
            Promise.reject('请求错误');
        }
        return data;
    },
    error => {
        error.response &&
            console.error(
                codeMessages[error.response.status] ||
                    error.response.data.msg ||
                    '服务器错误，请重试'
            );
        return Promise.reject(error);
    }
);

export default instance;
