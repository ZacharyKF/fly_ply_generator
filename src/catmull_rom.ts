import { Point } from "bezier-js";
import { abs, floor, max, min, number } from "mathjs";
import { point_add, point_mul, point_sub } from "./math";

interface CatMulSegment {
    p1: Point,
    p2: Point,
    m0: Point,
    m1: Point,
    mid: Point,
}

export class CatmullRom {

    public segments: CatMulSegment[];

    constructor(points: Point[], tension: number, flip_ends: boolean) {
        
        if (flip_ends) {
            points.unshift(
                point_add(
                    points[0],
                    point_sub(
                        points[0],
                        points[1],
                    )));

            points.push(
                point_add(
                    points[points.length - 1],
                    point_sub(
                        points[points.length - 1],
                        points[points.length - 2],
                    )));
        }

        let s = 2 * tension;
        
        let segments: CatMulSegment[] = [];
        for(let i = 1; i < points.length - 2; i ++) {

            let p0 = points[i - 1];
            let p1 = points[i];
            let p2 = points[i + 1];
            let p3 = points[i + 2];
            let mid = p0;

            segments.push({
                p1,
                p2,
                m0: {
                    x: (p2.x - p0.x) / s,
                    y: (p2.y - p0.y) / s,
                },
                m1: {
                    x: (p3.x - p1.x) / s,
                    y: (p3.y - p1.y) / s,
                },
                mid,
            });
        }

        segments.forEach(seg => {
            let mid_new = this.get_segment(seg, 0.5);
            seg.mid = mid_new;
        });

        this.segments = segments;
    }

    get(t: number): Point {

        if (t <= 0) {
            return this.segments[0].p1;
        } else if (t >= 1.0) {
            return this.segments[this.segments.length - 1].p2;
        }

        let t_rel = t * this.segments.length;
        let t_idx = floor(t_rel);
        let t_seg = t_rel - t_idx;

        return this.get_segment(
            this.segments[t_idx],
            t_seg
        );
    }

    get_segment(s: CatMulSegment, t: number): Point {

        if (t <= 0) {
            return s.p1;
        } else if (t >= 1.0) {
            return s.p2;
        }

        let tt = t * t;
        let ttt = tt * t;

        let c = 2*ttt - 3*tt;
        let c0 = c + 1;
        let c1 = ttt - 2*tt + t;
        let c2 = -1.0 * c;
        let c3 = ttt - tt;

        return {
            x: c0 * s.p1.x + c1 * s.m0.x + c2 * s.p2.x + c3 * s.m1.x,
            y: c0 * s.p1.y + c1 * s.m0.y + c2 * s.p2.y + c3 * s.m1.y
        }
    }

    get_at_dimm_dist(dimm: number, dist: number): Point {

        
        // Need our point to distance function
        let point_to_dist = (point: Point): number => 0;
        {
            switch(dimm) {
            case 2:
                point_to_dist = (point: Point): number => {
                    return abs(point.z != undefined ? point.z - dist: 0);
                };
                break;
            case 1:
                point_to_dist = (point: Point): number => {
                    return abs(point.y - dist);
                };
                break;
            case 0:
            default:
                point_to_dist = (point: Point): number => {
                    return abs(point.x - dist);
                };
                break;
            }
        };

        let t_final = 0.5;
        let p_final = this.get(t_final);
        let seg_dist = point_to_dist(p_final);
        let t_step = 1.0;
        let p_l, p_r, p_d_l, p_d_r, t_l, t_r;
        for(let d = 0; d < 20; d++) {

            if (seg_dist == 0){
                break;
            }

            t_step = t_step/2;
            t_l = t_final - t_step;
            t_r = t_final + t_step;

            if (t_l >= 0) {
                p_l = this.get(t_l);
                p_d_l = point_to_dist(p_l);
                if (p_d_l < seg_dist) {
                    t_final = t_l;
                    seg_dist = p_d_l;
                    p_final = p_l;
                    continue;
                }
            }

            if (t_r <= 1) {
                p_r = this.get(t_r);
                p_d_r = point_to_dist(p_r);
                if (p_d_r < seg_dist){
                    t_final = t_r;
                    seg_dist = p_d_r;
                    p_final = p_r;
                    continue;
                }
            }
        }
        
        return p_final;
    }
}