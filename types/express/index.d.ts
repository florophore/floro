import { Busboy } from 'busboy'

declare global {
    namespace Express {
        interface Request {
            busboy: Busboy;
        }
    }
}