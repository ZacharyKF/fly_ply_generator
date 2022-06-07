import { Point } from "./rational_point";

export class RationalBounds<P extends Point> {
    min: P;
    max: P;

    constructor(init: P) {
        this.min = init;
        this.max = init;
    }

    consume(p: P) {
        this.min = <P>this.min.min(p);
        this.max = <P>this.max.max(p);
    }
}