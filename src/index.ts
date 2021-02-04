/**
 * 创建axios的实例，增加拦截器
 */
import axios, { AxiosResponse } from 'axios';
import codeMessages from './codeMessages';

const instance = axios.create({
    timeout: 10000,
});

export interface ResponseDataInterface<T> {
    code: number;
    data: T;
    message?: string;
    msg?: string;
}

instance.defaults.headers.post['Content-Type'] = 'application/json';

/**
 * request拦截器
 */
instance.interceptors.request.use(
    (config: any) => {
        config.headers.Authorization = 'Bearer';
        if (!/^http/.test(config.url)) {
            // 本地服务走代理
            config.url = `/api${/^\//.test(config.url) ? '' : '/'}${config.url}`;
        }
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
    (response: AxiosResponse<ResponseDataInterface<any>>): ResponseDataInterface<any> => {
        const data = response.data;
        if (data.code && data.code !== 200) {
            Promise.reject('请求错误');
        }
        return data;
    },
    (error: any) => {
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
