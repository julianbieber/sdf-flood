#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 2) readonly buffer SliderParameters {
    float v[];
} sliders;

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define furDepth 0.1

struct SceneSample {
    float closest_distance;
    int index;
    vec3 rep;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCone(vec3 p, vec2 c, float h) {
    // c is the sin/cos of the angle, h is height
    // Alternatively pass q instead of (c,h),
    // which is the point at the base in 2D
    vec2 q = h * vec2(c.x / c.y, -1.0);

    vec2 w = vec2(length(p.xz), p.y);
    vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
    vec2 b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0);
    float k = sign(q.y);
    float d = min(dot(a, a), dot(b, b));
    float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
    return sqrt(d) * sign(s);
}

float sdConeBound(vec3 p, vec2 c, float h) {
    float q = length(p.xz) / 2.0;
    return max(dot(c.xy, vec2(q, p.y)), -h - p.y);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdPlane(vec3 p, vec3 n, float h) {
    // n must be normalized
    return dot(p, n) + h;
}

float sdCylinder(vec3 p, vec3 c, float h, float r) {
    vec2 d = abs(vec2(length(p.xz - c.xz), p.y - c.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}
float hash(vec4 p) {
    p = 50.0 * fract(p * 0.3183099 + vec4(0.71, 0.113, 0.419, 0.453));
    return -1.0 + 2.0 * fract(p.x * p.y * p.z * p.w * (p.x + p.y + p.z));
}
float noised(vec4 p, float g) {
    float angle = (p.y * 0.1);
    float c = cos(angle);
    float s = sin(angle);
    mat4 rot = mat4(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, c, -s, 0, 0, s, -c);
    vec4 rotated_p = p * rot;

    const vec2 e = vec2(0.0, 1.0);
    vec4 i = floor(rotated_p); // integer
    vec4 f = fract(rotated_p); // fract

    f = f * f * (3. - 2. * f * f);

    return mix(mix(mix(mix(hash(i + e.xxxx),
                    hash(i + e.yxxx), f.x),
                mix(hash(i + e.xyxx),
                    hash(i + e.yyxx), f.x), f.y),
            mix(mix(hash(i + e.xxyx),
                    hash(i + e.yxyx), f.x),
                mix(hash(i + e.xyyx),
                    hash(i + e.yyyx), f.x), f.y), f.z),
        mix(mix(mix(hash(i + e.xxxy),
                    hash(i + e.yxxy), f.x),
                mix(hash(i + e.xyxy),
                    hash(i + e.yyxy), f.x), f.y),
            mix(mix(hash(i + e.xxyy),
                    hash(i + e.yxyy), f.x),
                mix(hash(i + e.xyyy),
                    hash(i + e.yyyy), f.x), f.y), f.z), f.w);
}

float sdTriPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float sdRoundTriPrism(vec3 p, vec2 h, float r) {
    return max(sdTriPrism(p, h), -sdSphere(p - vec3(0.0, h.x * 0.5, -1.0), r));
}

float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb) {
    p.x = abs(p.x);
    float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy);
    return sqrt(dot(p, p) + ra * ra - 2.0 * ra * k) - rb;
}

float sdCatNose(vec3 p) {
    return sdSphere(p, 0.11);
}

float sdCatMouth(vec3 p) {
    vec3 pRot = rotate(p, PI, 0.0, 0.0);
    float left = sdCappedTorus(pRot + vec3(-0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    float right = sdCappedTorus(pRot + vec3(0.09, 0.0, 1.0), vec2(0.1, 0.1), 0.15, 0.01);
    return min(left, right);
}

const float eyeSize = 0.1;
const float eyeOffsetX = 0.3;
const float eyeOffsetY = 0.1;
const float headRadius = 1.0;

const vec3 rep = vec3(2.0, 8.0, 8.0);
SceneSample scene(vec3 p) {
    vec3 pRep = p - rep * round(p / rep);
    vec3 repId = round(p / rep);

    float earSize = 0.3;
    float earOffset = 0.5;
    float mouthWidth = 0.2;
    float mouthHeight = 0.1;
    float mouthOffsetY = -0.3;
    SceneSample head = SceneSample(sdSphere(pRep, headRadius), 1, repId);

    SceneSample leftEar = SceneSample(sdConeBound(pRep + vec3(-earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId);
    SceneSample rightEar = SceneSample(sdConeBound(pRep + vec3(earOffset, -headRadius + 0.0, 0.2), vec2(0.35, 0.1), 0.5), 2, repId);
    SceneSample ear = combine(leftEar, rightEar);

    SceneSample leftEye = SceneSample(sdSphere(pRep - vec3(eyeOffsetX, eyeOffsetY, -headRadius * 0.9), eyeSize), 3, repId);
    SceneSample rightEye = SceneSample(sdSphere(pRep - vec3(-eyeOffsetX, eyeOffsetY, -headRadius * 0.9), eyeSize), 3, repId);

    SceneSample eye = combine(leftEye, rightEye);

    SceneSample nose = SceneSample(sdCatNose(pRep - vec3(0.0, 0.0, -headRadius * 0.9)), 4, repId);

    SceneSample mouth = SceneSample(sdCatMouth(pRep), 5, repId);

    return combine(mouth, combine(nose, combine(head, combine(eye, ear))));
    // return mouth;
}

float scene_f(vec3 p) {
    return scene(p).closest_distance;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene_f(p + h.xyy) - scene_f(p - h.xyy),
            scene_f(p + h.yxy) - scene_f(p - h.yxy),
            scene_f(p + h.yyx) - scene_f(p - h.yyx)));
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += s.closest_distance;
    }

    return RayEnd(SceneSample(traveled, -1, vec3(0.0)), start + direction * traveled);
}
vec3 rotateX(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(p.x, ca * p.y - sa * p.z, sa * p.y + ca * p.z);
}

vec3 rotateY(vec3 p, float a) {
    float sa = sin(a);
    float ca = cos(a);
    return vec3(ca * p.x + sa * p.z, p.y, -sa * p.x + ca * p.z);
}

vec2 cartesianToSpherical(vec3 p) {
    float r = length(p);

    float t = (r - (1.0 - furDepth)) / furDepth;
    vec3 p2 = rotateX(p.zyx, p.x).zyx; // curl

    p2 /= r;
    vec2 uv = vec2(atan(p2.y, p.x), acos(p2.z));

    //uv.x += cos(iTime*1.5)*t*t*0.4;	// curl
    //uv.y += sin(iTime*1.7)*t*t*0.2;
    uv.y -= t * 0.1; // curl down
    return uv;
}

float furDensity(vec3 pos) {
    vec2 uv = cartesianToSpherical(pos);
    float x = noised(vec4(uv * 123.0, uv), 4.1);
    float y = noised(vec4(uv * 123.0, uv * 129.0), 1.1) / 10.0;

    // thin out hair
    float furThreshold = 0.4;
    float density = smoothstep(furThreshold, 1.0, x);

    // pos.y -= elevation;
    vec3 p = pos;
    // p = rotateX(p, sin(p.y));
    float r = length(pos) - 0.12 * sin(6. * p.x) * cos(6. * p.y) * sin(6. * p.z);
    float t = (r - (1. - furDepth)) / furDepth;

    return density * (1. - t);
}

vec3 furNormal(vec3 pos, float density) {
    float eps = 0.0001;
    vec3 n;
    n.x = furDensity(vec3(pos.x + eps, pos.y, pos.z)) - density;
    n.y = furDensity(vec3(pos.x, pos.y + eps, pos.z)) - density;
    n.z = furDensity(vec3(pos.x, pos.y, pos.z + eps)) - density;
    return normalize(n);
}
vec3 furShade(vec3 pos, vec3 color, vec3 light, vec3 eye, float density) {
    vec3 v = normalize(light - pos);
    vec3 n = furNormal(pos, density);
    vec3 ev = normalize(pos - eye);
    vec3 h = reflect(ev, n);

    float diff = max(0.0, dot(v, n)) + 0.4;
    float spec = pow(max(0.0, dot(v, h)), 64.);

    float r = length(pos);
    float t = (r - (1.0 - furDepth)) / furDepth;
    t = clamp(t, 0.3, 1.);

    diff = mix(diff, 1., 0.5);

    return color * t * (diff + 1.9 * spec);
}

vec2 hash22(vec2 p, float repScale) {

    // Repetition.
    p = mod(p, repScale);

    // Faster, but doesn't disperse things quite as nicely. However, when framerate
    // is an issue, and it often is, this is a good one to use. Basically, it's a tweaked
    // amalgamation I put together, based on a couple of other random algorithms I've
    // seen around... so use it with caution, because I make a tonne of mistakes. :)
    float n = sin(dot(p, vec2(113, 1)));

    return (fract(vec2(262144, 32768) * n) - .5);
}

vec4 resolve_color(int index, vec3 p, vec3 repId, vec3 dir) {
    vec3 rep = vec3(2.0, 8.0, 8.0);
    vec3 pRep = p - rep * round(p / rep);
    if (index == 1) {
        float d = 0;
        // vec4 baseColor = vec4(hash22(sin(repId.xy + noised(vec4(p, 0.0) * 0.01, 0.0))/0.01, 1.0), hash22(cos(repId.yz), 1.0));
        vec3 baseColor = (vec3(
                0.5 * noised(vec4(pRep * 4.7, repId.x * 1.1), repId.x) + noised(vec4(pRep * 0.01 + 0.45, repId.x * 0.3), repId.x) + 1.5,
                0.5 * noised(vec4(pRep * 4.7, repId.y * 1.1), repId.x) + noised(vec4(pRep * 0.01 + 0.45, repId.x * 0.3), repId.x) + 1.5,
                0.5 * noised(vec4(pRep * 4.7, repId.z * 1.1), repId.x) + noised(vec4(pRep * 0.01 + 0.45, repId.x * 0.3), repId.x) + 1.5));
        // baseColor = baseColor + vec4(205.0 / 255.0, 133.0 / 255.0, 63.0 / 255.0, 0.0);
        // vec4 brown = vec4(205.0 / 255.0, 133.0 / 255.0, 63.0 / 255.0, 1.0);
        // vec4 brown = vec4(205.0 / 255.0, 133.0 / 255.0, 63.0 / 255.0, 1.0);
        // baseColor.x = smoothstep(baseColor.x, brown.x, max(noised(vec4(p * 0.3, 0.0), 0.3), 0.0));
        // baseColor.y = smoothstep(baseColor.y, brown.y, max(noised(vec4(p * 0.3, 1.0), 0.3), 0.0));
        // baseColor.z = smoothstep(baseColor.z, brown.z, max(noised(vec4(p * 0.3, 2.0), 0.3), 0.0));
        baseColor = baseColor * max(noised(vec4(p * 4.3, 0.0), 0.3), 0.1);
        // vec4 baseColor = vec4(1.0);
        vec3 color = vec3(0.0, 0.0, 0.0);
        vec3 samplePos = pRep;
        for (int i = 0; i < 100; i++) {
            color += baseColor * furDensity(samplePos);
            samplePos += dir * 0.01;
        }
        color = furShade(p, color, vec3(0.0, 10.0, 3.0), vec3(0.0, -10.0, 0.0), 0.6);
        return vec4(color, 1.0);
    }
    if (index == 2) {
        float d = 0;
        // vec4 baseColor = vec4(hash22(sin(repId.xy)/0.01, 1.0), hash22(cos(repId.yz), 1.0));
        vec4 baseColor = vec4(0.0);
        baseColor = baseColor + vec4(205.0 / 255.0, 133.0 / 255.0, 63.0 / 255.0, 0.0) * 0.6;
        vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
        vec3 samplePos = pRep - vec3(0.0, 1.2, 0.0);
        for (int i = 0; i < 100; i++) {
            color += baseColor * furDensity(samplePos);
            samplePos += dir * 0.01;
        }
        color.w = 1.0;
        return color;
    }
    if (index == 3) {
        vec3 rightEyeCenter =  vec3(-eyeOffsetX, eyeOffsetY, -headRadius );
        vec3 rightEyeLeft =  rightEyeCenter - vec3(eyeSize,0.0,0.0);
        vec3 rightEyeRight =  rightEyeCenter  + vec3(eyeSize,0.0,0.0);
        vec3 leftEyeCenter = vec3(eyeOffsetX, eyeOffsetY, -headRadius);
        vec3 leftEyeLeft = leftEyeCenter  - vec3(eyeSize,0.0,0.0);
        vec3 leftEyeRight = leftEyeCenter + vec3(eyeSize,0.0,0.0);
        float eyeOverLap = 1.3;
        if((length(pRep - rightEyeLeft) < eyeSize * eyeOverLap && length(pRep - rightEyeRight) < eyeSize* eyeOverLap) ||
        (length(pRep - leftEyeLeft) < eyeSize * eyeOverLap && length(pRep - leftEyeRight) < eyeSize* eyeOverLap) ){
            return vec4(0.0, 0.0, 0.0, 1.0);
        }else{
            vec4 green = vec4(44.0/255.0, 73.0/255.0, 63.0/255.0,1.0);
            vec4 brown = vec4(91.0/255.0, 58.0/255.0, 41.0/255.0, 1.0);
            vec4 orange = vec4(255.0, 140.0, 0.0,1.0);

            return green;// + 0.8 * orange;
        }
    }

    if (index == 4) {
        float d = 0;
        // vec4 baseColor = vec4(hash22(sin(repId.xy + vec2(10.0, 1.0))/0.01, 1.0), hash22(cos(repId.yz), 1.0));
        vec4 baseColor = vec4(0.01);
        vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
        vec3 samplePos = pRep - vec3(0.0, 0.0, 1.0);
        for (int i = 0; i < 100; i++) {
            color += baseColor * furDensity(samplePos);
            samplePos += dir * 0.01;
        }
        color.w = 1.0;
        return color;
    }
    if (index == 5) {
        return vec4(1.0, 0.0, 0.0, 1.0);
    }
    vec4 c = vec4(0);
    c.w = 1.0;
    return c;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        vec4 c = vec4(0);
        c.w = 1.0;
        return c;
    }
    vec4 color = resolve_color(end.s.index, end.current_position, end.s.rep, ray);
    return color;
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.08)) / 1.08;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(-1.0, -1.0, -5.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
